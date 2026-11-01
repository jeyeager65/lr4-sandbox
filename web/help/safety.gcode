(Video Learn: NAME=Safety: lost steps + fire)
(Video Learn: GROUP=Running a job)
(Video Learn: KIND=demo)
(Video Learn: DESC=A knot makes X skip steps; Z losing a few steps on each lift ends in a jammed bit, smoke and a fire.)
(Video Learn: DESC=Never leave it running.)
(Safety: lost steps and a fire - LR4 Sandbox video, Part 44e)
(Record: node tools/record_demo.js web/help/safety.gcode - the page plays it live: Learn > Safety)
(Serve the repo first: python tools/serve.py sandbox --no-open)
(FluidNC: every line under 127 bytes, Video lines too, and no parens in a comment - ALARM 17)
(From the try videos knot_square + zdrift_fire. The Z slips are scripted - NOW= after each lift;)
(the knot's slips, the jam and the fire follow from the model. Heat / fire constants illustrative)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=300 YMIN=0 YMAX=200 ZMIN=-19 ZMAX=0)
(Stock Hard: KNOT=100,120,15)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=2 LEN=12.7 NAME=1/8in flat 1/2in flutes)
(Video: KIND=machine MACHINE=26x50 SOUND=on HOLD=4)
(Video AsBuilt: ON=on POWER=off STOPY=0 STOPZ=0 RACK=0 TILT=0)
(Video Slip: ON=on SEED=44)
(Video Heat: ON=on FIRE=on AUTO=on)
(Video Title: TIME=5 TEXT=Educational use only. Not professional safety advice.|Never leave your CNC running unattended.)
(Video Title: TIME=4 TEXT=Your setup may differ.|You are responsible for your own safety.)
(Video Title: TIME=3 TEXT=Never leave it running|Lost steps, and how a fire starts)
(Video Show: HIDE=Dust_Shoe*,Dust_Skirt*,Bristles_TPU*,hose)
(Video Home: OFFSET=20 VIEW=front DIST=1500)
(Video Zero: X=150 Y=150)
(Video Shot: VIEW=stock TIME=1.5 DIST=450)
(Video Text: TIME=5 TEXT=The dust shoe is off for this video, so you can see the bit)
(Video Text: TIME=6 TEXT=Too deep, too fast or a hard spot: a motor can't push, and skips steps)
(Video Wait: TIME=4)
G21 G90 G54
T1
M3 S18000
G0 Z5
G0 X40 Y120
G1 Z-4 F300
(Video Shot: VIEW=tool TIME=1.5 DIST=420)
(Video Text: TIME=5 TEXT=A square, 4 mm deep at 2500 mm/min. Its first side runs through a knot)
G1 X160 F2500
(Video Shot: VIEW=stock TIME=1.5 DIST=450)
(Video Text: TIME=6 TEXT=X lost steps in the knot. FluidNC doesn't know - the rest is shifted)
G1 Y180
G1 X40
G1 Y120
G0 Z5
(Video Text: TIME=6 TEXT=The square doesn't close: its last side misses the start by what X lost)
(Video Wait: TIME=6)
G0 Z40
(Video Text: TIME=6 TEXT=Homing finds where the machine really is. The job goes on from there)
G4 P0
$H
(Video Shot: VIEW=stock TIME=1.5 DIST=450)
(Video Text: TIME=6 TEXT=Next: slots 6 mm deep - 1/8in bit, 12.7 mm of flutes)
G0 Z10
G0 X20 Y25
G1 Z-6 F300
(Video Shot: VIEW=tool TIME=1.5 DIST=420)
G1 X280 F1200
G0 Z10
(Video Slip: NOW=zmin MM=4)
(Video Slip: NOW=zmax MM=4)
(Video Text: TIME=6 TEXT=Lifting, Z binds and slips 4 mm. FluidNC doesn't know)
G0 X20 Y50
G1 Z-6 F300
G1 X280 F1200
G0 Z10
(Video Slip: NOW=zmin MM=4)
(Video Slip: NOW=zmax MM=4)
(Video Text: TIME=5 TEXT=That slot was 10 mm deep, not 6. And Z slipped again)
G0 X20 Y75
(Video Text: TIME=6 TEXT=Now it plunges 14 mm - past the flutes. The shank can't cut: X is stuck)
G1 Z-6 F300
G1 X100 F1200
(Video Shot: VIEW=front TIME=2 DIST=2400)
(Video Text: TIME=6 TEXT=The bit spins in one spot, rubbing: smoke, then fire)
G1 X280 F1200
(Video EStop: DO=press AFTER=8)
(Video Text: TIME=5 TEXT=E-stop: the power is off)
G0 Z10
(Video Shot: VIEW=stock TIME=1.5 DIST=450)
(Video Text: TIME=7 TEXT=It started with Z losing a few steps. Never leave your CNC running unattended.)
(Video Wait: TIME=8)
G0 Z40
M5
M30
