(LowRider 4 Sandbox feature tour - a small LR4 sign, scripted as a video for tools/record_demo.js)
(The job: T1 1/8in flat - "LR4" 1.5 mm deep + four corner holes through; T2 90deg V-bit - a V border; 1/4in MDF)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=200 YMIN=0 YMAX=100 ZMIN=-6.35 ZMAX=0)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=1 LEN=12 OAL=38 NAME=1/8in 1-flute upcut)
(ToolDef 2: SHAPE=vbit ANGLE=90 D=12.7 LEN=6.35 OAL=38 FLUTES=2 NAME=1/2in 90deg V-bit)
(Video: SIZE=1920x1080 FPS=30 VOLUME=0.6 PAUSE=2 MESSAGETIME=3 HOLD=3 PARK=on DETAIL=full MACHINE=26x50 TABLE=34in ROOM=16x20x9ft PENDANT=on)
(Video Pendant: SHOW=off)

(--- the page: the machine, Show, Inspect ---)
(Video Title: TIME=3.5 TEXT=LowRider 4 Sandbox|V1E's LowRider 4, built to your size, in the browser)
(Video Shot: VIEW=workshop TIME=1 ORBIT=7)
(Video Text: TIME=4 TEXT=Every printed part is V1E's own STL, placed from its holes)
(Video Shot: VIEW=machine TIME=2 ORBIT=6)
(Video Text: TIME=3 TEXT=Show: just the frame...)
(Video Show: PRESET=frame)
(Video Wait: TIME=3)
(Video Text: TIME=3 TEXT=...or just the printed parts)
(Video Show: PRESET=printed)
(Video Wait: TIME=3)
(Video Show: PRESET=all)
(Video Text: TIME=3 TEXT=Inspect: one assembly on its own, with its parts list)
(Video Inspect: ID=core TIME=1.5 ORBIT=6)
(Video Text: TIME=3 TEXT=Explode it along its bolt lines)
(Video Inspect: EXPLODE=0.7 TIME=2.5)
(Video Wait: TIME=1)
(Video Inspect: EXPLODE=0 TIME=1.5)
(Video Text: TIME=3 TEXT=Cut a section through it)
(Video Inspect: SECTION=y@0.5 FLIP=on TIME=2.5)
(Video Wait: TIME=1)
(Video Inspect: SECTION=off TIME=0.5)
(Video Text: TIME=3 TEXT=X-ray: the hardware inside the printed parts)
(Video Inspect: VIEW=xray TIME=3)
(Video Text: TIME=2.5 TEXT=Lines: every edge, front and back)
(Video Inspect: VIEW=lines TIME=2.5)
(Video Inspect: VIEW=solid TIME=0.5)
(Video Inspect: ID=off TIME=1.5)

(--- running it: home, zero, the job ---)
(Video Text: TIME=4 TEXT=Run: $H on its own switches, at real speed)
(Video Home: OFFSET=30 DIST=650)
(Video Zero: X=150 Y=120)
(Video Shot: VIEW=stock TIME=2)
(Video Pendant: SHOW=on CORNER=br SIZE=24)
(Video Text: TIME=4 TEXT=The FluidTouch pendant runs its real firmware, live in the corner)
(Video Speed: FIT=25 REAL=3)
G0 G54 G17 G21 G90 G94
T1
G10 L20 P0 X0 Y0 Z0 (here = X0 Y0, temporary Z0)
G0 X6 Y6
M0 (MSG, Attach Probe)
G38.2 Z-110 F200 P0.5 (probe, Z = plate thickness)
G0 Z10
M0 (MSG, Remove Probe and Turn On Router at Dial 3)

(===== T1: 1/8in 1-flute upcut =====)
(MSG, 1/3 T1 Engrave LR4)
(Video Shot: VIEW=tool TIME=1.5)
(Video Text: TIME=4.5 TEXT=Show hides any part mid-job: the dust skirt and bristles come off to see the bit)
(Video Show: HIDE=Dust_Skirt*,Bristles_TPU*)
(L)
G0 Z4
G0 X37 Y75
G1 Z-1.5 F180
G1 Y25 F900
G1 X67
G0 Z4
(R)
G0 X82 Y25
G1 Z-1.5 F180
G1 Y75 F900
G1 X104
G1 X112 Y67
G1 Y58
G1 X104 Y50
G1 X82
G0 Z4
G0 X96 Y50
G1 Z-1.5 F180
G1 X114 Y25 F900
G0 Z4
(Video Text: TIME=4 TEXT=Machine sounds: TMC2209 steppers, the Kobalt router, the shop vac)
(4)
G0 X152 Y25
G1 Z-1.5 F180
G1 Y75 F900
G1 X124 Y38
G1 X164
G0 Z4

(MSG, 2/3 T1 Corner holes)
(Video Show: SHOW=Dust_Skirt*,Bristles_TPU*)
(Video Text: TIME=3.5 TEXT=...and back on, as it runs on the real machine)
(Video Shot: VIEW=machine TIME=2 ORBIT=10)
G0 X17.2 Y16
G1 Z0 F180
G3 X17.2 Y16 I-1.2 J0 Z-2 F400
G3 X17.2 Y16 I-1.2 J0 Z-4 F400
G3 X17.2 Y16 I-1.2 J0 Z-6.6 F400
G3 X17.2 Y16 I-1.2 J0
G0 Z4
G0 X185.2 Y16
G1 Z0 F180
G3 X185.2 Y16 I-1.2 J0 Z-2 F400
G3 X185.2 Y16 I-1.2 J0 Z-4 F400
G3 X185.2 Y16 I-1.2 J0 Z-6.6 F400
G3 X185.2 Y16 I-1.2 J0
G0 Z4
G0 X185.2 Y84
G1 Z0 F180
G3 X185.2 Y84 I-1.2 J0 Z-2 F400
G3 X185.2 Y84 I-1.2 J0 Z-4 F400
G3 X185.2 Y84 I-1.2 J0 Z-6.6 F400
G3 X185.2 Y84 I-1.2 J0
G0 Z4
G0 X17.2 Y84
G1 Z0 F180
G3 X17.2 Y84 I-1.2 J0 Z-2 F400
G3 X17.2 Y84 I-1.2 J0 Z-4 F400
G3 X17.2 Y84 I-1.2 J0 Z-6.6 F400
G3 X17.2 Y84 I-1.2 J0
G0 Z4
G0 Z10
M5

(===== T2: 1/2in 90deg V-bit =====)
(Video Text: TIME=4.5 TEXT=Tool change: the job stops, the V-bit goes in, and it probes again)
(Video Shot: VIEW=tool TIME=1.5)
G0 X6 Y6
T2
M0 (MSG, Change to T2 1/2in 90deg V-bit and Attach Probe)
G38.2 Z-110 F200 P0.5 (probe again: a new bit, a new length)
G0 Z10
M0 (MSG, Remove Probe and Turn On Router at Dial 3)
(MSG, 3/3 T2 V border)
(Video Shot: VIEW=stock TIME=1.5)
G0 Z4
G0 X8 Y8
G1 Z-2.5 F180
G1 X192 F900
G1 Y92
G1 X8
G1 Y8
G0 Z10
M5
(MSG, Done - Turn Off Router)
(Video Shot: VIEW=top TIME=2)
(Video Title: TIME=3.5 TEXT=LowRider 4 Sandbox|Size it, build it, run it - in the browser)
M30
