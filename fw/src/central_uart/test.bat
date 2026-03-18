::west build -b nrf54l15dk/nrf54l15/cpuapp -d _build

nrfutil device halt --serial-number 1057777061
nrfutil device halt --serial-number 1057743303

west flash -d _build -i 1057777061 --erase
west flash -d _build -i 1057743303 --erase