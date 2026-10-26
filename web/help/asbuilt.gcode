(As built + tram: a racked gantry, a router out of tram, a warped spoilboard - Help video, Part 43)
(The page plays it live: Help > As built. YouTube: node tools/record_demo.js web/help/asbuilt.gcode)
(KIND=ui: the whole page on screen. Keep every line under 127 bytes: FluidNC stops on longer ones)
(The rectangle: node tools/help_jobs.js square - 500 x 300 mm and both diagonals, 1 mm deep)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=-10 XMAX=510 YMIN=-10 YMAX=310 ZMIN=-12.7 ZMAX=0)
(ToolDef 1: SHAPE=vbit D=12.7 ANGLE=60 NAME=60 deg V-bit)
(ToolDef 2: SHAPE=flat D=25.4 FLUTES=2 NAME=1in surfacing bit)
(Video: KIND=ui MACHINE=26x50 FPS=30 VOLUME=0.6 PAUSE=3 MESSAGETIME=4 HOLD=2)
(Video AsBuilt: ON=on RACK=4 TILT=2 STOPY=1.5 STOPZ=0.5 EXAG=10 TRAM=1 WARPX=0.8 WARPY=-0.5 BOW=0.6)
(Video Title: TIME=3 TEXT=As built|No machine is perfect - this one shows it)
(Video Step: ID=st-ab TIME=0.8)
(Video Point: ID=ab-mode TIME=5 TEXT=Ideal or Real-world: Real-world gives the machine your build's errors)
(Video Point: ID=ab-sy TIME=5 TEXT=One Y switch 1.5 mm further on than the other: homing leaves the gantry racked)
(Video Point: ID=ab-wx TIME=5 TEXT=A spoilboard that isn't flat: higher at one end, bowed in the middle)
(Video Point: ID=ab-tx TIME=5 TEXT=A router out of tram: the bit leans 1 degree)
(Video Text: TIME=4 TEXT=The drawing magnifies the rack 10x so you can see it - the cuts stay true)
(Video Shot: VIEW=gantrytop TIME=2)
(Video Wait: TIME=3)
(Video Step: ID=t-run TIME=0.8)
(Video Zero: X=60 Y=100)
(Video Click: ID=home TIME=0.7)
(Video Point: ID=ab-now TIME=5 TEXT=After homing: still racked 1.5 mm - the switches aren't square)
(Video Shot: VIEW=stock TIME=1.5)
(Video Click: ID=job-start TIME=0.8)
(Video Click: ID=start-go TIME=0.5)
G0 G54 G17 G21 G90 G94
T1
G10 L20 P0 X0 Y0 Z0
G0 X-5 Y-5
(Video Speed: X=5 REAL=0)
M0 (MSG, Attach Probe)
(Video Text: TIME=5 TEXT=Z from the touch plate first: the board isn't flat, so this is its height here only)
G38.2 Z-110 F200 P0.5
G0 Z5
M0 (MSG, Remove Probe and Turn On Router at Dial 4)
(Video Speed: X=5 REAL=2)
(Video Text: TIME=5 TEXT=The squareness test: a rectangle and its diagonals)
G0 X0 Y0
G1 Z-1 F300
G1 X500 Y0 F1500
G1 X500 Y300
G1 X0 Y300
G1 X0 Y0
G0 Z3
G0 X0 Y0
G1 Z-1 F300
G1 X500 Y300 F1500
G0 Z3
G0 X500 Y0
G1 Z-1 F300
G1 X0 Y300 F1500
G0 Z3
(Video Text: TIME=6 TEXT=Measure both diagonals: on a racked gantry they differ - square it and they match)
(Video Point: ID=ab-sq TIME=4 TEXT=This test, sized to your machine, goes to the SD card from here)
G0 Z15
M0 (MSG, Turn Off Router, Change to T2 1in surfacing bit)
T2
G0 X-5 Y-5
M0 (MSG, Attach Probe)
G38.2 Z-110 F200 P0.5
G0 Z5
M0 (MSG, Remove Probe and Turn On Router at Dial 5)
G0 X60 Y80
G0 Z3
(Video Shot: VIEW=tool TIME=2 DIST=420)
(Video Text: TIME=6 TEXT=Surfacing 0.5 mm: the tilted bit leaves ridges, the warp leaves spots it misses)
G1 Z-0.5 F300
G1 X260 F1500
G1 Y100
G1 X60
G1 Y120
G1 X260
G1 Y140
G1 X60
G0 Z10
(Video Shot: VIEW=stock TIME=2)
(Video Text: TIME=6 TEXT=Fix the tram, surface the spoilboard flat, tune the pulloffs - then cut)
G0 Z20
M5
M30
