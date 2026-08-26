west build -b nrf55fm20dk/nrf55fm20a/cpuapp -d _build

nrfutil device halt --serial-number 1052627300
nrfutil device halt --serial-number 1052673544

west flash -d _build -i 1052627300 --erase --no-rebuild
west flash -d _build -i 1052673544 --erase --no-rebuild