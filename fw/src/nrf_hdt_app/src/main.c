/*
 * Copyright (c) 2018 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-5-Clause
 */

/** @file
 *  @brief Nordic UART Service Client sample
 */

#include <errno.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>

#include <bluetooth/services/nus.h>
#include <bluetooth/services/nus_client.h>
#include <bluetooth/gatt_dm.h>
#include <bluetooth/scan.h>

#include <dk_buttons_and_leds.h>

#include <zephyr/settings/settings.h>

#include <zephyr/drivers/uart.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zephyr/logging/log.h>
#include <bluetooth/hci_vs_sdc.h>

#define LOG_MODULE_NAME hdt_demo
LOG_MODULE_REGISTER(LOG_MODULE_NAME);

#define STACKSIZE CONFIG_UART_THREAD_STACK_SIZE
#define UART_PRIORITY 7
#define NUS_PRIORITY 4

/* UART payload buffer element size. */
#define UART_BUF_SIZE CONFIG_UART_BUFFER_SIZE

#define RUN_STATUS_LED DK_LED1
#define RUN_LED_BLINK_INTERVAL 1000

#define DEVICE_NAME CONFIG_BT_DEVICE_NAME
#define DEVICE_NAME_LEN (sizeof(DEVICE_NAME) - 1)

#define CON_STATUS_LED DK_LED2
#define TEST_LED DK_LED3

#define KEY_PASSKEY_ACCEPT DK_BTN1_MSK
#define KEY_PASSKEY_REJECT DK_BTN2_MSK

#define NUS_WRITE_TIMEOUT K_MSEC(150)
#define UART_WAIT_FOR_BUF_DELAY K_MSEC(50)
#define UART_RX_TIMEOUT 50000 /* Wait for RX complete event time in microseconds. */
#define SECURITY_REQ_DELAY K_MSEC(200)	// not used?
#define REPORT_RATE 4 // reports per second
#define MAX_MTU_SIZE 495
#define MIN_PACKET_SIZE 23
#define DEFAULT_CONN_INTERVAL_UNITS 40
#define MIN_CONN_INTERVAL_UNITS 6
#define MAX_CONN_INTERVAL_UNITS 400

static K_SEM_DEFINE(ble_init_ok, 0, 1);

static const struct device *uart = DEVICE_DT_GET(DT_CHOSEN(nordic_nus_uart));
static struct k_work_delayable uart_work;
static struct k_work_delayable security_work;
static struct k_work scan_work;
static struct k_work adv_work;

#define NUM_PHYS 7
enum phy_type {
	HDT75 = 0,
	HDT6,
	HDT4,
	HDT3,
	HDT2,
	LE2M,
	LE1M,
};
/*enum phy_type {
	PHY_75M = 0,
	PHY_5M,
	PHY_22M,
	PHY_2M,
	PHY_1M,
};*/

K_SEM_DEFINE(nus_write_sem, 0, 1);
K_SEM_DEFINE(throughput_sem, 1, 1);
K_SEM_DEFINE(nus_transmit_sem, 0, 1);

volatile bool led_state = true;
volatile int last_phy = LE1M;
volatile bool connected_state = false;
volatile int throughput_timer_count = 0;
volatile int current_delay = 0;
volatile uint32_t received_data = 0;
volatile bool central_mode = true;
volatile int current_mtu = 20;
volatile bool skip_measurement = false;
volatile enum phy_type actual_phy = LE1M;
volatile uint16_t requested_packet_size = MAX_MTU_SIZE;
volatile bool phy_change_ongoing = false;
volatile bool freeze_phy = false;
volatile enum phy_type requested_phy = LE1M;
/* Set when the link is on HDT but this board didn't pick the rate (peer-initiated). */
volatile bool hdt_rate_unknown = false;
/* Central-side bounce: HDT target to apply after the intermediate LE2M. */
static volatile enum phy_type pending_phy = LE2M;
static volatile bool pending_phy_valid = false;

static uint16_t current_conn_interval_units = DEFAULT_CONN_INTERVAL_UNITS;
static uint16_t current_conn_latency = 0;
static uint16_t current_conn_timeout = 400;
static bool has_known_conn_interval = false;
static bool pending_conn_interval_update = false;
static uint16_t pending_conn_interval_units = DEFAULT_CONN_INTERVAL_UNITS;

uint8_t push_data[MAX_MTU_SIZE] = {0};

struct uart_data_t {
	void *fifo_reserved;
	uint8_t  data[UART_BUF_SIZE];
	uint16_t len;
};
volatile bool active_phys[NUM_PHYS] = {true, true, true, true, true};
volatile uint16_t throughput_numbers[NUM_PHYS] = {6000, 4000, 1800, 1400, 780};



void my_throughput_work_handler(struct k_work *work);
K_WORK_DEFINE(throughput_work, my_throughput_work_handler);
void my_push_data_work_handler(struct k_work *work);
K_WORK_DEFINE(push_data_work, my_push_data_work_handler);
void my_throughput_timeout_handler(struct k_timer *timer);
void my_push_data_timer_handler(struct k_timer *timer);
K_TIMER_DEFINE(throughput_timer, my_throughput_timeout_handler, NULL);
K_TIMER_DEFINE(push_data_timer, my_push_data_timer_handler, NULL);

static K_FIFO_DEFINE(fifo_uart_tx_data);
static K_FIFO_DEFINE(fifo_uart_rx_data);

static struct bt_conn *default_conn = NULL;
static struct bt_nus_client nus_client;
static bool advertising_started;
static bool scan_paused_by_uart;
static bool mtu_exchange_started;

static void send_startup_message(void);
static void update_data_length(struct bt_conn *conn);
static void update_phy(struct bt_conn *conn, enum phy_type phy);
static const char *phy2str(uint8_t phy);
void update_remote_phy(enum phy_type phy);
void toggle_local_led(void);

static int request_conn_interval_update(uint16_t conn_interval_units)
{
	if (!default_conn) {
		return -ENOTCONN;
	}

	if (!has_known_conn_interval &&
	    conn_interval_units == DEFAULT_CONN_INTERVAL_UNITS) {
		LOG_INF("Skip conn interval update: waiting for first interval callback");
		return 0;
	}

	if (has_known_conn_interval &&
	    conn_interval_units == current_conn_interval_units) {
		LOG_INF("Skip conn interval update: unchanged (0x%04x)",
			conn_interval_units);
		return 0;
	}

	/* Convert timeout: conn_interval is in 1.25ms units, timeout is in 10ms units
	 * Timeout should be 4x the interval value, but no shorter than 4 seconds (400 units)
	 * This ensures adequate robustness while scaling with interval
	 */
	uint16_t adjusted_timeout = (conn_interval_units * 4 > 400) ? (conn_interval_units * 4) : 400;
	struct bt_le_conn_param conn_param = {
		.interval_min = conn_interval_units,
		.interval_max = conn_interval_units,
		.latency = current_conn_latency,
		.timeout = adjusted_timeout,
	};
	LOG_INF("requesting conn interval update: %d units (%d ms), latency: %d, timeout: %d units (%d ms)",
		conn_interval_units, conn_interval_units * 125 / 100, current_conn_latency, adjusted_timeout, adjusted_timeout * 10);

	int err = bt_conn_le_param_update(default_conn, &conn_param);
	if (err) {
		LOG_WRN("bt_conn_le_param_update failed (err %d)", err);
		return err;
	}

	LOG_INF("Requested conn interval update to 0x%04x", conn_interval_units);
	return 0;
}

static void try_apply_pending_conn_interval_update(void)
{
	if (!pending_conn_interval_update || !default_conn) {
		return;
	}

	int err = request_conn_interval_update(pending_conn_interval_units);
	if (!err) {
		pending_conn_interval_update = false;
		LOG_INF("Applied deferred conn interval update: 0x%04x",
			pending_conn_interval_units);
	} else {
		LOG_WRN("Deferred conn interval update still pending (err %d)", err);
	}
}

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, DEVICE_NAME, DEVICE_NAME_LEN),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_NUS_VAL),
};

static void adv_work_handler(struct k_work *work)
{
	int err;

	ARG_UNUSED(work);

	err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_2, ad, ARRAY_SIZE(ad), sd,
			      ARRAY_SIZE(sd));
	if (err == -EALREADY) {
		advertising_started = true;
		LOG_INF("Advertising already active");
		return;
	}

	if (err) {
		LOG_ERR("Advertising failed to start (err %d)", err);
		return;
	}

	advertising_started = true;
	LOG_INF("Advertising successfully started");
}

static void advertising_start(void)
{
	/* A connectable adv event steals radio time from the connection event
	 * (cuts the extended event short), throttling throughput. Don't advertise
	 * while connected. */
	if (advertising_started || connected_state) {
		return;
	}

	k_work_submit(&adv_work);
}

static void ble_data_sent(struct bt_nus_client *nus, uint8_t err,
					const uint8_t *const data, uint16_t len)
{
	ARG_UNUSED(nus);
	ARG_UNUSED(data);
	ARG_UNUSED(len);
	LOG_INF("Data ACKed");

	k_sem_give(&nus_write_sem);

	if (err) {
		LOG_WRN("ATT error code: 0x%02X", err);
	}
}

static void nus_server_data_received(struct bt_conn *conn,
				     const uint8_t *const data, uint16_t len)
{
	ARG_UNUSED(conn);
	ARG_UNUSED(data);

	/* Stripped to the bare minimum to test whether per-packet receive-side
	 * work is the ~2.86 ms/packet bottleneck. Single writer, so no lock. */ // Temporary. Remove later.
	received_data += len; // Temporary. Remove later.
}


// Client side BLE data:
static uint8_t ble_data_received(struct bt_nus_client *nus,
						const uint8_t *data, uint16_t len)
{
	ARG_UNUSED(nus);
	int packet_size;
	// int err;
	received_data += (uint32_t)len;
	LOG_INF("received data over BLE connection (central): %d bytes", len);
	if (len >= 4) {
		LOG_INF("Data: 0x%02x:%02x:%02x:%02x", data[0], data[1], data[2], data[3]);
	} else if (len == 3) {
		LOG_INF("Data: 0x%02x:%02x:%02x", data[0], data[1], data[2]);
	} else if (len == 2) {
		LOG_INF("Data: 0x%02x:%02x", data[0], data[1]);
	} else if (len == 1) {
		LOG_INF("Data: 0x%02x", data[0]);
	}
	if (data[0] == '$' && data[1] == 'S') {
		packet_size = ((uint16_t)data[2] << 8) | data[3];
		current_mtu = packet_size;
		LOG_INF("new packet size: %d bytes", packet_size);
	} else if (data[0] == '$' && data[1] == 'L' ){
		toggle_local_led();
	} else if (data[0] == '$' && data[1] == 'P' && len >= 3) {
		/* Peer asked us (the central) to drive the PHY change. An HDT rate is
		 * only applied on a fresh transition to HDT, so an HDT->HDT change must
		 * bounce through LE2M first. */
		enum phy_type target = (enum phy_type)data[2];
		LOG_INF("Remote requested PHY update to %s (enum %d)", phy2str(target), target);
		bool already_there = (target == actual_phy) && !pending_phy_valid;
		bool already_going = pending_phy_valid && (target == pending_phy);
		if (default_conn && !already_there && !already_going) {
			if ((actual_phy <= HDT2) && (target <= HDT2) && (target != actual_phy)) {
				pending_phy = target;
				pending_phy_valid = true;
				update_phy(default_conn, LE2M);
			} else {
				pending_phy_valid = false;
				update_phy(default_conn, target);
			}
		}
	} else {
		LOG_WRN("Received data with unknown format");
	}



	// for (uint16_t pos = 0; pos != len;) {
	// 	struct uart_data_t *tx = k_malloc(sizeof(*tx));

	// 	if (!tx) {
	// 		LOG_WRN("Not able to allocate UART send data buffer");
	// 		return BT_GATT_ITER_CONTINUE;
	// 	}

	// 	/* Keep the last byte of TX buffer for potential LF char. */
	// 	size_t tx_data_size = sizeof(tx->data) - 1;

	// 	if ((len - pos) > tx_data_size) {
	// 		tx->len = tx_data_size;
	// 	} else {
	// 		tx->len = (len - pos);
	// 	}

	// 	memcpy(tx->data, &data[pos], tx->len);

	// 	pos += tx->len;

	// 	/* Append the LF character when the CR character triggered
	// 	 * transmission from the peer.
	// 	 */
	// 	if ((pos == len) && (data[len - 1] == '\r')) {
	// 		tx->data[tx->len] = '\n';
	// 		tx->len++;
	// 	}

	// 	err = uart_tx(uart, tx->data, tx->len, SYS_FOREVER_MS);
	// 	if (err) {
	// 		k_fifo_put(&fifo_uart_tx_data, tx);
	// 	}
	// }

	return BT_GATT_ITER_CONTINUE;
}

static void uart_cb(const struct device *dev, struct uart_event *evt, void *user_data)
{
	ARG_UNUSED(dev);

	static size_t aborted_len;
	struct uart_data_t *buf;
	static uint8_t *aborted_buf;
	static bool disable_req;

	switch (evt->type) {
	case UART_TX_DONE:
		LOG_DBG("UART_TX_DONE");
		if ((evt->data.tx.len == 0) ||
		    (!evt->data.tx.buf)) {
			return;
		}

		if (aborted_buf) {
			buf = CONTAINER_OF(aborted_buf, struct uart_data_t,
					   data[0]);
			aborted_buf = NULL;
			aborted_len = 0;
		} else {
			buf = CONTAINER_OF(evt->data.tx.buf,
					   struct uart_data_t,
					   data[0]);
		}

		k_free(buf);

		buf = k_fifo_get(&fifo_uart_tx_data, K_NO_WAIT);
		if (!buf) {
			return;
		}

		if (uart_tx(uart, buf->data, buf->len, SYS_FOREVER_MS)) {
			LOG_WRN("Failed to send data over UART");
		}

		break;

	case UART_RX_RDY:
		LOG_DBG("UART_RX_RDY");
		buf = CONTAINER_OF(evt->data.rx.buf, struct uart_data_t, data[0]);
		buf->len += evt->data.rx.len;

		if (disable_req) {
			return;
		}

		if ((evt->data.rx.buf[buf->len - 1] == '\n') ||
		    (evt->data.rx.buf[buf->len - 1] == '\r')) {
			disable_req = true;
			uart_rx_disable(uart);
		}

		break;

	case UART_RX_DISABLED:
		LOG_DBG("UART_RX_DISABLED");
		disable_req = false;

		buf = k_malloc(sizeof(*buf));
		if (buf) {
			buf->len = 0;
		} else {
			LOG_WRN("Not able to allocate UART receive buffer");
			k_work_reschedule(&uart_work, UART_WAIT_FOR_BUF_DELAY);
			return;
		}

		uart_rx_enable(uart, buf->data, sizeof(buf->data),
			       UART_RX_TIMEOUT);

		break;

	case UART_RX_BUF_REQUEST:
		LOG_DBG("UART_RX_BUF_REQUEST");
		buf = k_malloc(sizeof(*buf));
		if (buf) {
			buf->len = 0;
			uart_rx_buf_rsp(uart, buf->data, sizeof(buf->data));
		} else {
			LOG_WRN("Not able to allocate UART receive buffer");
		}

		break;

	case UART_RX_BUF_RELEASED:
		LOG_DBG("UART_RX_BUF_RELEASED");
		buf = CONTAINER_OF(evt->data.rx_buf.buf, struct uart_data_t,
				   data[0]);

		if (buf->len > 0) {
			k_fifo_put(&fifo_uart_rx_data, buf);
		} else {
			k_free(buf);
		}

		break;

	case UART_TX_ABORTED:
		LOG_DBG("UART_TX_ABORTED");
		if (!aborted_buf) {
			aborted_buf = (uint8_t *)evt->data.tx.buf;
		}

		aborted_len += evt->data.tx.len;
		buf = CONTAINER_OF(aborted_buf, struct uart_data_t,
				   data[0]);

		uart_tx(uart, &buf->data[aborted_len],
			buf->len - aborted_len, SYS_FOREVER_MS);

		break;

	default:
		break;
	}
}

static void uart_work_handler(struct k_work *item)
{
	struct uart_data_t *buf;

	buf = k_malloc(sizeof(*buf));
	if (buf) {
		buf->len = 0;
	} else {
		LOG_WRN("Not able to allocate UART receive buffer");
		k_work_reschedule(&uart_work, UART_WAIT_FOR_BUF_DELAY);
		return;
	}

	uart_rx_enable(uart, buf->data, sizeof(buf->data), UART_RX_TIMEOUT);
}

static int uart_init(void)
{
	int err;
	struct uart_data_t *rx;

	if (!device_is_ready(uart)) {
		LOG_ERR("UART device not ready");
		return -ENODEV;
	}

	rx = k_malloc(sizeof(*rx));
	if (rx) {
		rx->len = 0;
	} else {
		return -ENOMEM;
	}

	k_work_init_delayable(&uart_work, uart_work_handler);

	err = uart_callback_set(uart, uart_cb, NULL);
	if (err) {
		return err;
	}

	return uart_rx_enable(uart, rx->data, sizeof(rx->data),
			      UART_RX_TIMEOUT);
}

static void discovery_complete(struct bt_gatt_dm *dm,
			       void *context)
{
	struct bt_nus_client *nus = context;
	LOG_INF("Service discovery completed");

	bt_gatt_dm_data_print(dm);

	bt_nus_handles_assign(dm, nus);
	bt_nus_subscribe_receive(nus);

	bt_gatt_dm_data_release(dm);
	k_timer_start(&push_data_timer, K_MSEC(6000), K_NO_WAIT);
}

static void discovery_service_not_found(struct bt_conn *conn,
					void *context)
{
	LOG_INF("Service not found");
}

static void discovery_error(struct bt_conn *conn,
			    int err,
			    void *context)
{
	LOG_WRN("Error while discovering GATT database: (%d)", err);
}

struct bt_gatt_dm_cb discovery_cb = {
	.completed         = discovery_complete,
	.service_not_found = discovery_service_not_found,
	.error_found       = discovery_error,
};

static void gatt_discover(struct bt_conn *conn)
{
	int err;

	if (conn != default_conn) {
		return;
	}

	err = bt_gatt_dm_start(conn,
			       BT_UUID_NUS_SERVICE,
			       &discovery_cb,
			       &nus_client);
	if (err) {
		LOG_ERR("could not start the discovery procedure, error "
			"code: %d", err);
	}
}

static void exchange_func(struct bt_conn *conn, uint8_t err,
				  struct bt_gatt_exchange_params *params);

static void start_mtu_exchange(struct bt_conn *conn)
{
	int err;
	static struct bt_gatt_exchange_params exchange_params;

	if (mtu_exchange_started) {
		return;
	}

	mtu_exchange_started = true;
	exchange_params.func = exchange_func;
	err = bt_gatt_exchange_mtu(conn, &exchange_params);
	if (err) {
		LOG_WRN("MTU exchange failed (err %d)", err);
		gatt_discover(conn);
	} else {
		LOG_INF("MTU exchange initiated (err %d)", err);
	}
}

static void exchange_func(struct bt_conn *conn, uint8_t err, struct bt_gatt_exchange_params *params)
{
	if (!err) {
		LOG_INF("MTU exchange done");
		LOG_INF("MTU size: %d", bt_gatt_get_mtu(conn));
		current_mtu = bt_gatt_get_mtu(conn);
	} else {
		LOG_WRN("MTU exchange failed (err %" PRIu8 ")", err);
	}

	gatt_discover(conn);

	ARG_UNUSED(params);
	update_data_length(conn);
	
	
}

static void security_work_handler(struct k_work *work)
{
	int err;
	struct bt_conn_info info;

	ARG_UNUSED(work);

	if (!default_conn) {
		return;
	}

	err = bt_conn_get_info(default_conn, &info);
	if (err) {
		LOG_WRN("Failed to get connection info (err %d)", err);
		return;
	}

	if (info.role != BT_CONN_ROLE_CENTRAL) {
		return;
	}

	if (!IS_ENABLED(CONFIG_CENTRAL_UART_AUTO_SECURITY)) {
		LOG_INF("Auto security disabled, starting MTU exchange directly");
		start_mtu_exchange(default_conn);
		return;
	}

	err = bt_conn_set_security(default_conn, BT_SECURITY_L2);
	if (err) {
		LOG_WRN("Failed to set security: %d", err);
		start_mtu_exchange(default_conn);
	}
}

static void on_connected(struct bt_conn *conn, uint8_t conn_err)
{
	char addr[BT_ADDR_LE_STR_LEN];
	int err;
	struct bt_conn_info info;
	

	bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

	if (conn_err) {
		LOG_INF("Failed to connect to %s, 0x%02x %s", addr, conn_err,
			bt_hci_err_to_str(conn_err));

		if (default_conn == conn) {
			bt_conn_unref(default_conn);
			default_conn = NULL;

			if (!scan_paused_by_uart) {
				(void)k_work_submit(&scan_work);
			}
		}

		return;
	}

	connected_state = true;
	dk_set_led(RUN_STATUS_LED, 1);

	err = bt_conn_get_info(conn, &info);
	if (err) {
		LOG_WRN("Failed to get connection info (err %d)", err);
		return;
	}

	LOG_INF("Connected: %s (role %s)", addr, info.role == BT_CONN_ROLE_CENTRAL ? "central" : "peripheral");

	if (info.role == BT_CONN_ROLE_PERIPHERAL) {
		LOG_INF("Inbound peripheral-role connection established");
		default_conn = bt_conn_ref(conn);
		try_apply_pending_conn_interval_update();
		return;
	}
	//k_timer_start(&push_data_timer, K_MSEC(4000), K_NO_WAIT);

	mtu_exchange_started = false;
	has_known_conn_interval = false;
	current_conn_interval_units = DEFAULT_CONN_INTERVAL_UNITS;
	current_conn_latency = 0;
	current_conn_timeout = 400;
	k_work_reschedule(&security_work, SECURITY_REQ_DELAY);
	//try_apply_pending_conn_interval_update();

	err = bt_scan_stop();
	if (err) {
		LOG_ERR("Stop LE scan failed (err %d)", err);
	}
}

static void on_disconnected(struct bt_conn *conn, uint8_t reason)
{
	char addr[BT_ADDR_LE_STR_LEN];

	bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

	LOG_INF("Disconnected: %s, reason 0x%02x %s", addr, reason, bt_hci_err_to_str(reason));
	connected_state = false;
	last_phy = LE1M;
	actual_phy = LE1M;

	if (default_conn != conn) {
		return;
	}

	(void)k_work_cancel_delayable(&security_work);
	mtu_exchange_started = false;
	has_known_conn_interval = false;
	current_conn_interval_units = DEFAULT_CONN_INTERVAL_UNITS;
	current_conn_latency = 0;
	current_conn_timeout = 400;

	bt_conn_unref(default_conn);
	default_conn = NULL;

	if (!scan_paused_by_uart) {
		(void)k_work_submit(&scan_work);
	} else {
		advertising_started = false;
		advertising_start();
	}
}

// static void on_security_changed(struct bt_conn *conn, bt_security_t level,
// 			     enum bt_security_err err)
// {
// 	char addr[BT_ADDR_LE_STR_LEN];

// 	struct bt_conn_info info;

// 	bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

// 	if (!err) {
// 		LOG_INF("Security changed: %s level %u", addr, level);
// 	} else {
// 		LOG_WRN("Security failed: %s level %u err %d %s", addr, level, err,
// 			bt_security_err_to_str(err));
// 	}

// 	bt_conn_get_info(conn, &info);
// 	if (info.role == BT_CONN_ROLE_PERIPHERAL) {
// 		return;
// 	}

// 	if (err) {
// 		gatt_discover(conn);
// 		return;
// 	}

// 	start_mtu_exchange(conn);
// }

void on_le_param_updated(struct bt_conn *conn, uint16_t interval, uint16_t latency, uint16_t timeout)
{
	ARG_UNUSED(conn);

	current_conn_interval_units = interval;
	current_conn_latency = latency;
	current_conn_timeout = timeout;
	has_known_conn_interval = true;

	LOG_INF("connection parameters updated: int 0x%04x lat 0x%04x timeout 0x%04x",
		interval, latency, timeout);

	//try_apply_pending_conn_interval_update();
}

void on_le_phy_updated(struct bt_conn *conn, struct bt_conn_le_phy_info *param)
{
	//char addr[BT_ADDR_LE_STR_LEN];
	//LOG_INF("LE PHY updated: tx_phy %u rx_phy %u", param->tx_phy, param->rx_phy);
	skip_measurement = true;
	//bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

	//LOG_INF("LE PHY updated: %s tx_phy %u rx_phy %u", addr, param->tx_phy, param->rx_phy);
	switch(param->tx_phy) {
		case BT_GAP_LE_PHY_1M:
			LOG_INF("PHY updated: 1MBPS");
			actual_phy = LE1M;
			hdt_rate_unknown = false;
			break;
		case BT_GAP_LE_PHY_2M:
			LOG_INF("PHY updated: 2MBPS");
			actual_phy = LE2M;
			hdt_rate_unknown = false;
			break;
		case BT_GAP_LE_PHY_HDT:
			/* The event carries no HDT rate, so use the rate we requested.
			 * If they disagree (peer-initiated or crossed updates) the rate
			 * is unknown on this board, so flag it instead of mislabelling.
			 */
			if (requested_phy <= HDT2) {
				actual_phy = requested_phy;
				hdt_rate_unknown = false;
				LOG_INF("PHY updated: %s", phy2str(actual_phy));
			} else {
				hdt_rate_unknown = true;
				actual_phy = HDT2;
				LOG_WRN("PHY updated: HDT (peer-initiated); rate unknown on this board");
			}
			break;
		default:
			LOG_INF("PHY updated: unknown");
			break;
	}

	/* Central-side bounce: reached the intermediate LE2M, apply the pending
	 * HDT target now (the previous change is complete, so this is allowed). */
	if (pending_phy_valid && actual_phy == LE2M && default_conn) {
		enum phy_type next = pending_phy;
		pending_phy_valid = false;
		update_phy(default_conn, next);
	}

	/* Resume throughput reports only once settled on the final requested PHY,
	 * so the intermediate LE2M during a bounce doesn't report. */
	if (actual_phy == requested_phy) {
		phy_change_ongoing = false;
	}
	//BT_CONN_LE_TX_POWER_PHY_1M = 1
	//BT_CONN_LE_TX_POWER_PHY_2M = 2
}

void on_le_data_len_updated(struct bt_conn *conn, struct bt_conn_le_data_len_info *info)
{
    uint16_t tx_len     = info->tx_max_len; 
    uint16_t tx_time    = info->tx_max_time;
    uint16_t rx_len     = info->rx_max_len;
    uint16_t rx_time    = info->rx_max_time;
    LOG_INF("Data length updated. Length %d/%d bytes, time %d/%d us", tx_len, rx_len, tx_time, rx_time);
}

bool on_le_param_req(struct bt_conn *conn, struct bt_le_conn_param *param)
{
	LOG_INF("CURRENT state: interval %d ms, latency %d, timeout %d ms",
		current_conn_interval_units * 125 / 100, current_conn_latency, current_conn_timeout * 10);
	LOG_INF("REQUESTED: int_min %d units (%d ms), int_max %d units (%d ms), lat %d, timeout %d units (%d ms)",
		param->interval_min, param->interval_min * 125 / 100,
		param->interval_max, param->interval_max * 125 / 100,
		param->latency, param->timeout, param->timeout * 10);

	if (param->interval_min < MIN_CONN_INTERVAL_UNITS ||
	    param->interval_max > MAX_CONN_INTERVAL_UNITS) {
		LOG_WRN("Interval out of range: min %d (sw_limit %d), max %d (sw_limit %d)",
			param->interval_min, MIN_CONN_INTERVAL_UNITS,
			param->interval_max, MAX_CONN_INTERVAL_UNITS);
		return false;
	}

	if (param->latency > 0) {
		LOG_WRN("Latency %d not supported", param->latency);
		return false;
	}

	/* timeout (10ms units) must be > 2 * interval_max (1.25ms units): timeout*10 > interval*1.25*2 => timeout*4 > interval */
	if (param->timeout * 4 <= param->interval_max || param->timeout > 3200) {
		LOG_WRN("Timeout out of range: %d*4=%d vs interval_max=%d, or timeout %d > 3200",
			param->timeout, param->timeout * 4, param->interval_max, param->timeout);
		return false;
	}

	LOG_INF("Connection parameter request ACCEPTED");
	return true;
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = on_connected,
	.disconnected = on_disconnected,
	// .security_changed = on_security_changed,
	.le_param_updated = on_le_param_updated,
	.le_param_req = on_le_param_req,
	.le_phy_updated = on_le_phy_updated,
	.le_data_len_updated = on_le_data_len_updated,
};

static void update_phy(struct bt_conn *conn, enum phy_type phy)
{
    int err;
	struct bt_conn_le_phy_param preferred_phy = {
		.options = BT_CONN_LE_PHY_OPT_NONE,
	};
	switch (phy) {
	case LE1M:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_1M;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_1M;
		requested_phy = LE1M;
		break;
	case LE2M:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_2M;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_2M;
		requested_phy = LE2M;
		break;
	case HDT2:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.options = BT_CONN_LE_PHY_OPT_HDT2;
		requested_phy = HDT2;
		break;
	case HDT3:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.options = (BT_CONN_LE_PHY_OPT_HDT2 | BT_CONN_LE_PHY_OPT_HDT3);
		requested_phy = HDT3;
		break;
	case HDT4:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.options = (BT_CONN_LE_PHY_OPT_HDT2 | BT_CONN_LE_PHY_OPT_HDT3 | BT_CONN_LE_PHY_OPT_HDT4);
		requested_phy = HDT4;
		break;
	case HDT6:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.options = (BT_CONN_LE_PHY_OPT_HDT2 | BT_CONN_LE_PHY_OPT_HDT3 | BT_CONN_LE_PHY_OPT_HDT4 | BT_CONN_LE_PHY_OPT_HDT6);
		requested_phy = HDT6;
		break;
	case HDT75:
		preferred_phy.pref_rx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.pref_tx_phy = BT_GAP_LE_PHY_HDT;
		preferred_phy.options = (BT_CONN_LE_PHY_OPT_HDT2 | BT_CONN_LE_PHY_OPT_HDT3 | BT_CONN_LE_PHY_OPT_HDT4 | BT_CONN_LE_PHY_OPT_HDT6 | BT_CONN_LE_PHY_OPT_HDT7_5);
		requested_phy = HDT75;
		break;
	default:
		LOG_WRN("Unsupported PHY enum %d", phy);
		return;
	}

    err = bt_conn_le_phy_update(conn, &preferred_phy);
    if (err) {
        LOG_ERR("bt_conn_le_phy_update() returned %d (opt 0x%x)", err, preferred_phy.options);
    }
}

static void update_data_length(struct bt_conn *conn)
{
    int err;
    struct bt_conn_le_data_len_param my_data_len = {
        .tx_max_len = BT_GAP_DATA_LEN_MAX,
        .tx_max_time = BT_GAP_DATA_TIME_MAX,
    };
    err = bt_conn_le_data_len_update(conn, &my_data_len);
    if (err) {
        LOG_ERR("data_len_update failed (err %d)", err);
    }
}

static void scan_filter_match(struct bt_scan_device_info *device_info,
			      struct bt_scan_filter_match *filter_match,
			      bool connectable)
{
	char addr[BT_ADDR_LE_STR_LEN];

	bt_addr_le_to_str(device_info->recv_info->addr, addr, sizeof(addr));

	LOG_INF("Filters matched. Address: %s connectable: %d",
		addr, connectable);
}

static void scan_connecting_error(struct bt_scan_device_info *device_info)
{
	LOG_WRN("Connecting failed");
}

static void scan_connecting(struct bt_scan_device_info *device_info,
			    struct bt_conn *conn)
{
	default_conn = bt_conn_ref(conn);
}

static int nus_client_init(void)
{
	int err;
	struct bt_nus_client_init_param init = {
		.cb = {
			.received = ble_data_received,
			.sent = ble_data_sent,
		}
	};

	err = bt_nus_client_init(&nus_client, &init);
	if (err) {
		LOG_ERR("NUS Client initialization failed (err %d)", err);
		return err;
	}

	LOG_INF("NUS Client module initialized");
	return err;
}

static struct bt_nus_cb nus_server_cb = {
	.received = nus_server_data_received,
};

BT_SCAN_CB_INIT(scan_cb, scan_filter_match, NULL,
		scan_connecting_error, scan_connecting);


static int scan_start(void)
{
	int err;
	uint8_t filter_mode = 0;

	if (scan_paused_by_uart) {
		LOG_INF("Scan start skipped (paused by UART command)");
		return 0;
	}

	err = bt_scan_stop();
	if (err) {
		LOG_ERR("Failed to stop scanning (err %d)", err);
		return err;
	}

	bt_scan_filter_remove_all();

	err = bt_scan_filter_add(BT_SCAN_FILTER_TYPE_NAME, CONFIG_BT_DEVICE_NAME);
	if (err) {
		LOG_ERR("Name filter cannot be added (err %d)", err);
		return err;
	}
	filter_mode |= BT_SCAN_NAME_FILTER;

	// bt_foreach_bond(BT_ID_DEFAULT, try_add_address_filter, &filter_mode);

	err = bt_scan_filter_enable(filter_mode, false);
	if (err) {
		LOG_ERR("Filters cannot be turned on (err %d)", err);
		return err;
	}

	err = bt_scan_start(BT_SCAN_TYPE_SCAN_ACTIVE);
	if (err) {
		LOG_ERR("Scanning failed to start (err %d)", err);
		return err;
	}

	LOG_INF("Scan started");
	return 0;
}

static void scan_work_handler(struct k_work *item)
{
	ARG_UNUSED(item);

	(void)scan_start();
}

static void scan_init(void)
{
	struct bt_scan_init_param scan_init = {
		.connect_if_match = true,
	};

	bt_scan_init(&scan_init);
	bt_scan_cb_register(&scan_cb);

	k_work_init(&scan_work, scan_work_handler);
	LOG_INF("Scan module initialized");
}

static void configure_gpio(void)
{
	int err;

	err = dk_leds_init();
	if (err) {
		LOG_ERR("Cannot init LEDs (err: %d)", err);
	}
}

int main(void)
{
	int blink_status = 0;
	int err;

	// err = bt_conn_auth_cb_register(&conn_auth_callbacks);
	// if (err) {
	// 	LOG_ERR("Failed to register authorization callbacks.");
	// 	return 0;
	// }

	configure_gpio();

	// err = bt_conn_auth_info_cb_register(&conn_auth_info_callbacks);
	// if (err) {
	// 	LOG_ERR("Failed to register authorization info callbacks.\n");
	// 	return 0;
	// }

	err = bt_enable(NULL);
	if (err) {
		LOG_ERR("Bluetooth init failed (err %d)", err);
		return 0;
	}
	LOG_INF("Bluetooth initialized");

	k_work_init(&adv_work, adv_work_handler);
	k_work_init_delayable(&security_work, security_work_handler);

	k_sem_give(&ble_init_ok);

	if (IS_ENABLED(CONFIG_SETTINGS)) {
		settings_load();
	}

	err = uart_init();
	if (err != 0) {
		LOG_ERR("uart_init failed (err %d)", err);
		return 0;
	}

	err = nus_client_init();
	if (err != 0) {
		LOG_ERR("nus_client_init failed (err %d)", err);
		return 0;
	}

	err = bt_nus_init(&nus_server_cb);
	if (err != 0) {
		LOG_ERR("bt_nus_init failed (err %d)", err);
		return 0;
	}

	scan_init();

	/* Extend connection events to fill available time — maximises throughput */
	sdc_hci_cmd_vs_conn_event_extend_t conn_event_extend_params = { .enable = 1 };
	err = hci_vs_sdc_conn_event_extend(&conn_event_extend_params);
	if (err) {
		LOG_WRN("hci_vs_sdc_conn_event_extend failed (err %d)", err);
	}

	err = scan_start();
	if (err) {
		return 0;
	}

	LOG_INF("Starting Bluetooth Central UART sample\n");
	send_startup_message();

	// struct uart_data_t nus_data = {
	// 	.len = 0,
	// };

	for (;;) {
		if (connected_state == false) {
			dk_set_led(RUN_STATUS_LED, (++blink_status) % 2);
		}
		k_sleep(K_MSEC(RUN_LED_BLINK_INTERVAL));
		/* Wait indefinitely for data to be sent over Bluetooth */
		// struct uart_data_t *buf = k_fifo_get(&fifo_uart_rx_data,
		// 				     K_FOREVER);

		// int plen = MIN(sizeof(nus_data.data) - nus_data.len, buf->len);
		// int loc = 0;

		// while (plen > 0) {
		// 	memcpy(&nus_data.data[nus_data.len], &buf->data[loc], plen);
		// 	nus_data.len += plen;
		// 	loc += plen;
		// 	if (nus_data.len >= sizeof(nus_data.data) ||
		// 	   (nus_data.data[nus_data.len - 1] == '\n') ||
		// 	   (nus_data.data[nus_data.len - 1] == '\r')) {
		// 		err = bt_nus_client_send(&nus_client, nus_data.data, nus_data.len);
		// 		if (err) {
		// 			LOG_WRN("Failed to send data over BLE connection"
		// 				"(err %d)", err);
		// 		}

		// 		err = k_sem_take(&nus_write_sem, NUS_WRITE_TIMEOUT);
		// 		if (err) {
		// 			LOG_WRN("NUS send timeout");
		// 		}

		// 		nus_data.len = 0;
		// 	}

		// 	plen = MIN(sizeof(nus_data.data), buf->len - loc);
		// }

		// k_free(buf);
	}
}

static char *skip_spaces(char *value)
{
	while (*value == ' ' || *value == '\t') {
		value++;
	}

	return value;
}

static uint16_t clamp_u16(uint16_t value, uint16_t min, uint16_t max)
{
	if (value < min) {
		return min;
	}

	if (value > max) {
		return max;
	}

	return value;
}

static bool parse_config_command(char *cmd, int *delay, int *phys,
				 uint16_t *file_size_mb,
				 uint16_t *conn_interval_units,
				 uint16_t *packet_size)
{
	if (strncmp(cmd, "$$", 2) != 0) {
		return false;
	}

	bool has_delay = false;
	bool has_phys = false;
	bool has_file = false;
	bool has_interval = false;
	bool has_packet = false;

	char *saveptr;
	char *token = strtok_r(cmd + 2, ",", &saveptr);

	while (token != NULL) {
		char *trimmed = skip_spaces(token);
		if (*trimmed == '\0') {
			return false;
		}

		char tag = *trimmed;
		char *value_str = trimmed + 1;
		if (*value_str == '\0') {
			return false;
		}

		char *endptr;
		unsigned long value = strtoul(value_str, &endptr, 16);
		if (endptr == value_str) {
			return false;
		}

		switch (tag) {
		case 'd':
			*delay = (int)value;
			has_delay = true;
			break;
		case 'p':
			*phys = (int)value;
			has_phys = true;
			break;
		case 'f':
			*file_size_mb = (uint16_t)value;
			has_file = true;
			break;
		case 'i':
			*conn_interval_units = (uint16_t)value;
			has_interval = true;
			break;
		case 'm':
			*packet_size = (uint16_t)value;
			has_packet = true;
			break;
		default:
			return false;
		}

		token = strtok_r(NULL, ",", &saveptr);
	}

	return has_delay && has_phys && has_file && has_interval && has_packet;
}

void toggle_local_led(void)
{
	dk_set_led(TEST_LED, led_state);
	led_state = !led_state;
}

void toggle_remote_led(void)
{
	uint8_t data[2] = {'$', 'L'};
	if (!default_conn) {
		return;
	}
	int err = bt_nus_send(default_conn, data, 2);
	if (err) {
		LOG_WRN("Failed to toggle remote LED (err %d)", err);
	} else {
		LOG_INF("Toggled remote LED");
	}
}

void update_packet_size(uint16_t packet_size)
{
	if (!default_conn) {
		return;
	}
	uint8_t data[4];
	data[0] = '$';
	data[1] = 'S';
	data[2] = (packet_size & 0xff00) >> 8;
	data[3] = packet_size & 0xff;

	int err = bt_nus_send(default_conn, data, sizeof(data));
	if (err) {
		LOG_WRN("Failed to update packet size (err %d)", err);
	} else {
		LOG_INF("Requested packet size update to %u bytes", packet_size);
	}
}

/* Ask the peer (the central/bulk sender) to perform the PHY change, so the
 * side that transmits the data is the one that initiates the HDT switch. */
void update_remote_phy(enum phy_type phy)
{
	if (!default_conn) {
		return;
	}

	requested_phy = phy; /* track locally so our own le_phy_updated knows the rate */
	uint8_t data[3] = { '$', 'P', (uint8_t)phy };
	int err = bt_nus_send(default_conn, data, sizeof(data));
	if (err) {
		LOG_WRN("Failed to send PHY request (err %d)", err);
	} else {
		LOG_INF("Sent remote PHY request: %s (enum %d)", phy2str(phy), phy);
	}
}

void handle_uart_command(struct uart_data_t nus_data)
{
	int err;
	int previous_phy = last_phy;

	LOG_INF("uart data: len %d, data:\n%s", nus_data.len, nus_data.data);
	scan_paused_by_uart = true;
	err = bt_scan_stop();
	if (err && err != -EALREADY) {
		LOG_WRN("Failed to stop scan (err %d)", err);
	}
	advertising_start();

	if (strncmp(nus_data.data, "led0", 4) == 0) {
		toggle_local_led();
	} else if (strncmp(nus_data.data, "led1", 3) == 0) {
		toggle_remote_led();
	} else if (strncmp(nus_data.data, "freeze", 6) == 0) {
		freeze_phy = true;
		LOG_INF("PHY freeze");
	} else if (strncmp(nus_data.data, "unfreeze", 8) == 0) {
		freeze_phy = false;
		LOG_INF("PHY unfreeze");
	} else {
		int delay = 0;
		int phys = 0;
		uint16_t file_size_mb = 0;
		uint16_t conn_interval_units = 0;
		uint16_t packet_size = 0;

		bool parsed = parse_config_command((char *)nus_data.data, &delay, &phys,
							  &file_size_mb,
							  &conn_interval_units,
							  &packet_size);

		if (!parsed) {
			LOG_WRN("Unknown UART command");
			return;
		}

		delay = (int)clamp_u16((uint16_t)delay, 0, 10);
		conn_interval_units = clamp_u16(conn_interval_units,
					       MIN_CONN_INTERVAL_UNITS,
					       MAX_CONN_INTERVAL_UNITS);
		packet_size = clamp_u16(packet_size, MIN_PACKET_SIZE, MAX_MTU_SIZE);
		if (file_size_mb < 1) {
			file_size_mb = 1;
		}

		current_delay = delay;
		k_timer_start(&throughput_timer, K_MSEC(1000/REPORT_RATE),
			      K_MSEC(1000/REPORT_RATE));

		for (int i = 0; i < NUM_PHYS; i++) {
			active_phys[i] = (phys & (1 << i)) != 0;
		}
		// Make sure last_phy is valid given the new active_phys
		if (active_phys[last_phy] == 0) {
			for (int i=0; i < NUM_PHYS; i++) {
				if (active_phys[i]) {
					last_phy = i;
					break;
				}
			}
		}
		if ((previous_phy != last_phy) && (default_conn != NULL)) {
			LOG_DBG("PHY change due to new config: %d", last_phy);
			update_remote_phy(last_phy);
		}
		
		//skip_measurement = true;
		received_data = 0;
		update_packet_size(packet_size);
		requested_packet_size = packet_size;

		LOG_INF("cfg delay=%d phys=0x%02x file=%uMB i=0x%04x m=%u",
			delay, phys, file_size_mb, conn_interval_units, packet_size);

		if (!default_conn) {
			pending_conn_interval_units = conn_interval_units;
			pending_conn_interval_update = true;
			LOG_INF("Deferred conn interval update to 0x%04x until connected",
				conn_interval_units);
			return;
		}

		(void)request_conn_interval_update(conn_interval_units);
	}
}

void handle_uart_thread(void)
{
	/* Don't go any further until BLE is initialized */
	k_sem_take(&ble_init_ok, K_FOREVER);
	struct uart_data_t nus_data = {
		.len = 0,
	};

	for (;;) {
		/* Wait indefinitely for data to be sent over serial */
		struct uart_data_t *buf = k_fifo_get(&fifo_uart_rx_data,
						     K_FOREVER);

		int plen = MIN(sizeof(nus_data.data) - nus_data.len, buf->len);
		int loc = 0;

		while (plen > 0) {
			memcpy(&nus_data.data[nus_data.len], &buf->data[loc], plen);
			nus_data.len += plen;
			loc += plen;

			//LOG_INF("uart data: len %d", nus_data.len);
			nus_data.data[nus_data.len] = '\0';
			handle_uart_command(nus_data);
			nus_data.len = 0;
			//dk_set_led(TEST_LED, led_state);
			//led_state = !led_state;

			plen = MIN(sizeof(nus_data.data), buf->len - loc);
		}

		k_free(buf);
	}
}

static void send_startup_message(void)
{
	static const char msg[] = "$$\n";
	struct uart_data_t *tx = k_malloc(sizeof(*tx));
	int ret;

	if (!tx) {
		LOG_ERR("Failed to allocate startup UART buffer");
		return;
	}

	tx->len = sizeof(msg) - 1;
	memcpy(tx->data, msg, tx->len);

	ret = uart_tx(uart, tx->data, tx->len, SYS_FOREVER_MS);
	if (ret) {
		LOG_ERR("Failed to send startup message over UART: %d", ret);
		k_free(tx);
	} else {
		LOG_INF("Startup message sent over UART");
	}
}

void update_throughput_data(uint8_t phy, uint16_t througput)
{
	LOG_DBG("PHY: %d, Throughput: %d", phy, througput);
	int ret;
	struct uart_data_t *tx = k_malloc(sizeof(*tx));
	tx->len = 4;
	tx->data[0] = 0xff;
	tx->data[1] = phy;
	tx->data[2] = (througput & 0xff00) >> 8;
	tx->data[3] = througput & 0xff;
	LOG_DBG("update_throughput_data: len %d, data:\n%02x %02x %02x", tx->len, tx->data[0], tx->data[1], tx->data[2]);

	ret = uart_tx(uart, tx->data, tx->len, SYS_FOREVER_MS);
	if (ret) {
		LOG_ERR("uart_tx failed: %d", ret);
		k_free(tx);  // Free on error since TX callback won't be called
	} else {
		LOG_DBG("uart_tx returned %d", ret);
	}
}

void my_push_data_work_handler(struct k_work *work)
{
	// int my_mtu = current_mtu - 3; // Subtract 3 bytes for ATT header
	// int counter = 0;
	ARG_UNUSED(work);
	k_sem_give(&nus_transmit_sem);
	// LOG_INF("sending data over BLE connection");
	// if (connected_state) {
	// 	// int err;
	// 	// err = bt_nus_client_send(&nus_client, push_data, my_mtu);
	// 	// if (err) {
	// 	// 	LOG_WRN("Failed to send data over BLE connection"
	// 	// 		"(err %d)", err);
	// 	// } else {
	// 	// 	LOG_INF("Sent %d bytes over BLE connection", my_mtu);
	// 	// }

	// 	int err = 0;
	// 	while (err == 0) {
	// 		err = bt_nus_client_send(&nus_client, push_data, my_mtu);
	// 		if (err) {
	// 			LOG_WRN("Failed to send data over BLE connection"
	// 				"(err %d)", err);
	// 			break;
	// 		} else {
	// 			counter++;
	// 			LOG_INF("Sent %d bytes over BLE connection", my_mtu);
	// 		}
	// 	}
	// 	LOG_INF("sent %d packets", counter);
	// }
}
static const char *phy2str(uint8_t phy)
{
	switch (phy) {
	case HDT75: return "HDT7.5";
	case HDT6: return "HDT6";
	case HDT4: return "HDT4";
	case HDT3: return "HDT3";
	case HDT2: return "HDT2";
	case LE2M: return "LE 2M";
	case LE1M: return "LE 1M";
	default: return "Unknown";
	}
}

void my_throughput_work_handler(struct k_work *work)
{
	ARG_UNUSED(work);
	uint32_t temp_received_data = 0;
	uint32_t throughput = 0;
	uint16_t throughput_kbps = 0;
	int previous_phy = last_phy;
	bool update_phy_flag = false;
	//enum phy_type phy = last_phy; // Example PHY type
	if ((throughput_timer_count++ >= REPORT_RATE*current_delay) && (freeze_phy == false)) {
		throughput_timer_count = 0;
		last_phy = (last_phy + 1) % NUM_PHYS; // Cycle through PHY types for demonstration
		while (!active_phys[last_phy]) {
			last_phy = (last_phy + 1) % NUM_PHYS;
		}
		//LOG_INF("updating PHY to %d", last_phy);
		switch (last_phy) {
			case LE1M:
				LOG_INF("Requesting PHY update to 1MBPS");
				break;
			case LE2M:
				LOG_INF("Requesting PHY update to 2MBPS");
				break;
			case HDT2:
				LOG_INF("Requesting PHY update to HDT2");
				break;
			case HDT3:
				LOG_INF("Requesting PHY update to HDT3");
				break;
			case HDT4:
				LOG_INF("Requesting PHY update to HDT4");
				break;
			case HDT6:
				LOG_INF("Requesting PHY update to HDT6");
				break;
			case HDT75:
				LOG_INF("Requesting PHY update to HDT75");
				break;
			default:
				LOG_INF("Requesting PHY update to unknown PHY");
				break;
		}
		//skip_measurement = true;
	}
	if ((previous_phy != last_phy)||(last_phy != actual_phy)) {
		LOG_INF("updating from PHY %s to PHY %s", phy2str(previous_phy), phy2str(last_phy));
		update_phy_flag = true;
		update_remote_phy(last_phy);
	}
	//last_phy = (last_phy + 1) % NUM_PHYS; // Cycle through PHY types for demonstration
	

	// uint16_t throughput_jitter = throughput_numbers[phy] + rand() % 20 - 10; // Add some jitter to the throughput number
	// if (throughput_jitter < 0) {
	// 	throughput_jitter = 0;
	// }
	k_sem_take(&throughput_sem, K_FOREVER);
	temp_received_data = received_data;
	received_data = 0;
	k_sem_give(&throughput_sem);
	throughput = (temp_received_data * REPORT_RATE);
	throughput_kbps = throughput * 8 / 1000; // Convert to kbps
	LOG_INF("phy, TP: %d, %d kbps %s", actual_phy, throughput_kbps, skip_measurement ? "(skipped)" : "");
	
	if(skip_measurement == false && phy_change_ongoing == false) {
		update_throughput_data(actual_phy, throughput_kbps);
	} else {
		LOG_INF("Skipping throughput report for PHY change %d, %d", skip_measurement, phy_change_ongoing);
		skip_measurement = false;
	}

	if (update_phy_flag) {
		phy_change_ongoing = true; // Skip the next measurement after a PHY update to allow the connection to stabilize
	}
	

}

void my_throughput_timeout_handler(struct k_timer *timer)
{
	k_work_submit(&throughput_work);
}

void my_push_data_timer_handler(struct k_timer *timer)
{
	LOG_INF("Push data timer expired, submitting push_data_work");
	k_work_submit(&push_data_work);
}


/* A write blocks (K_FOREVER buffer alloc) once the TX buffers are full, so a // Temporary. Remove later.
 * write taking longer than this marks "hitting the wall". Enqueue-only writes // Temporary. Remove later.
 * take a few us; a wait for the radio is far longer. Tune per PHY if needed. // Temporary. Remove later.
 */ // Temporary. Remove later.
#define WALL_BLOCK_THRESHOLD_US 150 // Temporary. Remove later. // Temporary. Remove later.

void my_push_thread(void)
{
	k_sem_take(&nus_transmit_sem, K_FOREVER);

	int err;
	int payload_len = current_mtu - 3; // Subtract 3 bytes for ATT header

	uint32_t burst = 0;         /* consecutive fast (non-blocking) writes */ // Temporary. Remove later.
	uint32_t sec_packets = 0;   /* writes in the current 1 s window */ // Temporary. Remove later.
	uint32_t sec_max_burst = 0; /* largest burst before a wall in the window */ // Temporary. Remove later.
	uint32_t win_start = k_uptime_get_32(); // Temporary. Remove later.

	LOG_INF("sending data over BLE connection");
	while (true)
	{
		payload_len = current_mtu - 3; // Update MTU in case it has changed
		if (payload_len < 1) {
			payload_len = 1;
		}
		if ((uint16_t)payload_len > requested_packet_size) {
			payload_len = requested_packet_size;
		}
		//err = bt_nus_client_send(&nus_client, push_data, payload_len);
		if (connected_state == true){
			uint32_t t0 = k_cycle_get_32(); // Temporary. Remove later.
			err = bt_gatt_write_without_response(default_conn, nus_client.handles.rx, push_data, payload_len, false);
			uint32_t dt_us = k_cyc_to_us_floor32(k_cycle_get_32() - t0); // Temporary. Remove later.

			if (err) { // Temporary. Remove later.
				LOG_WRN("write failed after %u pkts (err %d)", burst, err); // Temporary. Remove later.
				burst = 0; // Temporary. Remove later.
			} else { // Temporary. Remove later.
				sec_packets++; // Temporary. Remove later.
				if (dt_us > WALL_BLOCK_THRESHOLD_US) { // Temporary. Remove later.
					/* Blocked -> TX buffers were full (wall). */
					if (burst > sec_max_burst) { // Temporary. Remove later.
						sec_max_burst = burst; // Temporary. Remove later.
					} // Temporary. Remove later.
					burst = 0; // Temporary. Remove later.
				} else { // Temporary. Remove later.
					burst++; // Temporary. Remove later.
				} // Temporary. Remove later.
			} // Temporary. Remove later.

			uint32_t now = k_uptime_get_32(); // Temporary. Remove later.
			if (now - win_start >= 1000) { // Temporary. Remove later.
				uint32_t interval_us = 0; // Temporary. Remove later.
				struct bt_conn_info cinfo; // Temporary. Remove later.

				if (default_conn && // Temporary. Remove later.
				    bt_conn_get_info(default_conn, &cinfo) == 0) { // Temporary. Remove later.
					interval_us = cinfo.le.interval_us; // Temporary. Remove later.
				} // Temporary. Remove later.

				uint32_t per_interval = interval_us ? // Temporary. Remove later.
					(uint32_t)((uint64_t)sec_packets * interval_us / 1000000U) : 0; // Temporary. Remove later.

				LOG_INF("TX %s: %u pkts/s, %u B/pkt, conn_int %u us, ~%u pkts/conn-interval, max burst before wall %u", // Temporary. Remove later.
					hdt_rate_unknown ? "HDT (rate unknown)" : phy2str(actual_phy), sec_packets, payload_len, // Temporary. Remove later.
					interval_us, per_interval, sec_max_burst); // Temporary. Remove later.

				sec_packets = 0; // Temporary. Remove later.
				sec_max_burst = 0; // Temporary. Remove later.
				win_start = now; // Temporary. Remove later.
			} // Temporary. Remove later.
		}
	}
	// if (connected_state) {
	// 	// int err;
	// 	// err = bt_nus_client_send(&nus_client, push_data, my_mtu);
	// 	// if (err) {
	// 	// 	LOG_WRN("Failed to send data over BLE connection"
	// 	// 		"(err %d)", err);
	// 	// } else {
	// 	// 	LOG_INF("Sent %d bytes over BLE connection", my_mtu);
	// 	// }

	// 	int err = 0;
	// 	while (err == 0) {
	// 		err = bt_nus_client_send(&nus_client, push_data, my_mtu);
	// 		if (err) {
	// 			LOG_WRN("Failed to send data over BLE connection"
	// 				"(err %d)", err);
	// 			break;
	// 		} else {
	// 			counter++;
	// 			LOG_INF("Sent %d bytes over BLE connection", my_mtu);
	// 		}
	// 	}
	// 	LOG_INF("sent %d packets", counter);
	// }
}

K_THREAD_DEFINE(handle_uart_thread_id, STACKSIZE, handle_uart_thread, NULL, NULL,
		NULL, UART_PRIORITY, 0, 0);

K_THREAD_DEFINE(my_push_thread_id, STACKSIZE, my_push_thread, NULL, NULL,
		NULL, NUS_PRIORITY, 0, 0);