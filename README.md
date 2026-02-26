# HDT demo app

## Installation

For testing purposes, drag the and drop the `hdt-demo-0.1.0.tgz` file into the nRF Connect for Desktop (NCD) Launcher.
If you want to change something, you can save this repository to:
%USER%\.nrfconnect-apps\local
then run the command: 
`npm run watch`

To generate an updated .tgz file for drag and drop, run the command:
`npm pack --ignore-scripts`


## Uninstall application
If you have dragged and dropped the .tgz file into the nRF Connect for Desktop Launcher, it will be added to `%USER%\.nrfconnect-apps\local`
To remove it, just delete this file from that location.

## Documentation
For info on how to build nRF Connect for Desktop apps, please see:
https://nordicsemiconductor.github.io/pc-nrfconnect-docs/


## Embedded firmware
The firmware that is programmed onto the nRF54L15DK is found in the fw folder. It is currently built using NCS v3.2.1. To replace the file that is programmed onto the nRF54L15DK, please copy the .hex file into the "fw" folder, and rename it blinky-10156.hex.



## License

See the [LICENSE](LICENSE) file for details.
