(Short video test for tools/record_demo.js - about a minute of machine time: a probe, two M0s, two holes and a slot)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=120 YMIN=0 YMAX=80 ZMIN=-6.35 ZMAX=0)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=1 LEN=12 OAL=38 NAME=1/8in 1-flute upcut)
(Video: SIZE=960x540 FPS=30 VOLUME=0.6 PAUSE=1.5 MSGTIME=2 HOLD=1.5)
(Video Home: OFFSET=10 TIME=0.5 DIST=650)
(Video Zero: X=150 Y=120)
(Video Shot: VIEW=stock TIME=1)
(Video Speed: FIT=8 REAL=2)
G0 G54 G17 G21 G90 G94
T1
G10 L20 P0 X0 Y0 Z0
G0 X6 Y6
M0 (MSG, Attach Probe)
G38.2 Z-110 F200 P0.5
G0 Z10
M0 (MSG, Remove Probe and Turn On Router at Dial 3)
(MSG, Holes)
G0 Z4
G0 X30 Y30
G1 Z-3 F180
G3 X30 Y30 I3 J0 F900
G0 Z4
G0 X60 Y30
G1 Z-3 F180
G3 X60 Y30 I3 J0 F900
G0 Z4
(MSG, Slot)
G0 X20 Y55
G1 Z-2 F180
G1 X100 F900
G1 Z-4 F180
G1 X20 F900
G0 Z10
M5
