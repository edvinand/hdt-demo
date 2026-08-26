nrfutil device erase --serial-number 1052627300
nrfutil device erase --serial-number 1052673544

nrfutil device program --firmware hdt-nrf55fm20a.hex --serial-number 1052627300
nrfutil device program --firmware hdt-nrf55fm20a.hex --serial-number 1052673544

nrfutil device reset --serial-number 1052627300
nrfutil device reset --serial-number 1052673544