west build -b nrf55fm20dk@1.0.0/nrf55fm20a/cpuapp -d _build

nrfutil device halt --serial-number 1052722549
nrfutil device halt --serial-number 1052772808

west flash -d _build -i 1052722549 --erase --no-rebuild
west flash -d _build -i 1052772808 --erase --no-rebuild