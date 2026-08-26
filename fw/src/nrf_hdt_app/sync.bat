::@echo off
rm -rf _build_52840
rm -rf _build_54l15
rm -rf _build_55fm20
rm -rf _build
rm -rf C:\Users\edho\.nrfconnect-apps\local\hdt-demo\fw\src\central_uart
cp -r ..\nrf_hdt_app C:\Users\edho\.nrfconnect-apps\local\hdt-demo\fw\src\nrf_hdt_app

west build -b nrf55fm20dk/nrf55fm20a/cpuapp -d _build
west build -b nrf54l15dk/nrf54l15/cpuapp -d _build_54l15
west build -b nrf52840dk/nrf52840 -d _build_52840
west build -b nrf55fm20dk/nrf55fm20a/cpuapp -d _build_55fm20
@echo off
if exist "_build_52840\nrf_hdt_app\zephyr\zephyr.hex" (
    echo Replacing firmware for nRF52840DK
    copy /Y "_build_52840\nrf_hdt_app\zephyr\zephyr.hex" "C:\Users\edho\.nrfconnect-apps\local\hdt-demo\fw\hdt-nrf52840.hex" >nul
) else (
	echo Skipping nRF52840 FW. Doesn't exist
)
if exist "_build_54l15\nrf_hdt_app\zephyr\zephyr.hex" (
	echo Replacing firmware for nRF54L15DK
	copy /Y "_build_54l15\nrf_hdt_app\zephyr\zephyr.hex" "C:\Users\edho\.nrfconnect-apps\local\hdt-demo\fw\hdt-nrf54l15.hex" >nul
) else (
	echo Skipping nRF54L15 FW. Doesn't exist
)
if exist "_build_55fm20\nrf_hdt_app\zephyr\zephyr.hex" (
	echo Replacing firmware for nRF55FM20DK
	copy /Y "_build_55fm20\nrf_hdt_app\zephyr\zephyr.hex" "C:\Users\edho\.nrfconnect-apps\local\hdt-demo\fw\hdt-nrf55fm20a.hex" >nul
) else (
	echo Skipping nRF55FM20A FW. Doesn't exist
)
		