(Why home? A LowRider 4 isn't square until it homes - LR4 Sandbox video)
(Record: node tools/record_demo.js web/help/why_home.gcode - the page plays it live: Help > Why home?)
(Serve the repo first: python tools/serve.py sandbox --no-open)
(FluidNC keeps lines short: keep every line here under ~90 characters)
(Rack 8 mm, beam 5 mm off: big, so it shows at 1x; cuts are true)
(Tuned pulloffs: motor1 0.8 mm less on Y, 0.5 mm less on Z = the stops)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=120 ZMIN=-6.35 ZMAX=0)
(ToolDef 1: SHAPE=vbit D=6.35 ANGLE=60 NAME=60 deg V-bit)
(Video: SIZE=1920x1080 FPS=30 VOLUME=0.6 MESSAGETIME=4 HOLD=2 HOMING=z,x,y KIND=machine)
(Video AsBuilt: ON=on RACK=8 TILT=5 EXAG=1 TRAM=0)
(Video AsBuilt: STOPY=auto STOPZ=auto PULLOFFY=4/3.2 PULLOFFZ=4/3.5)
(Video Title: TIME=3 TEXT=Why home?|Powered down, the motors let go)
(Video Shot: VIEW=gantry TIME=1.5)
(Video Text: TIME=4 TEXT=Switched on: the gantry is racked, the beam off level)
(Video Wait: TIME=2)
(Video Shot: VIEW=gantrytop TIME=2)
(Video Text: TIME=3 TEXT=From above: one end is ahead of the other)
(Video Wait: TIME=2.5)
(Video Shot: VIEW=gantry TIME=2)
(Video Text: TIME=4 TEXT=Each Y motor and each Z motor has its own switch)
(Video Wait: TIME=1.5)
(Video Text: TIME=12 TEXT=$HZ, $HX, $HY: each side to its own switch, off by its own pulloff)
(Video Home: OFFSET=40 VIEW=gantry)
(Video Text: TIME=4 TEXT=Square and level: per-motor pulloffs even out the switches)
(Video Wait: TIME=3)
(Video Zero: X=150 Y=150)
(Video Shot: VIEW=stock TIME=1.5)
(Video Speed: FIT=10)
G0 G54 G17 G21 G90 G94
T1
G0 Z5
(MSG, A square cut from a square machine)
G0 X20 Y20
G1 Z-1 F300
G1 X180 F1500
G1 Y100
G1 X20
G1 Y20
G0 Z5
M30
