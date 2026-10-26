(Your own front plate: the template, an upload, the checks, the painted plate, the job's bit change - Help video, Part 43)
(The page plays it live: Help > Your own front plate. YouTube: node tools/record_demo.js web/help/front_plate.gcode)
(KIND=ui: the whole page. The design = the template's own Example layer: Video Design EXAMPLE=on)
(The sample job: LR4 engraved with a V-bit, a bit change, then a pocket with the 1/8in flat - as the strut job does)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=125 YMIN=0 YMAX=50 ZMIN=-6.35 ZMAX=0)
(ToolDef 2: SHAPE=vbit D=12.7 ANGLE=60 NAME=60 deg V-bit)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=1 LEN=12 OAL=38 NAME=1/8in 1-flute upcut)
(Video: KIND=ui MACHINE=26x50 FPS=30 VOLUME=0.6 PAUSE=3 MESSAGETIME=4 HOLD=2)
(Video Title: TIME=3 TEXT=Your own front plate|Draw it, upload it, the strut job cuts it)
(Video Step: ID=st-files TIME=0.8)
(Video Point: ID=pd-template TIME=5 TEXT=The template: sized for your plate, with Engrave, Pocket and Cut through layers)
(Video Text: TIME=4 TEXT=Draw on it in Inkscape or any SVG editor - text turned into paths - then upload it)
(Video Wait: TIME=2)
(Video Design: EXAMPLE=on)
(Video Point: ID=pd-checks TIME=6 TEXT=The page checks it: closed shapes, clear of the bolt holes, wide enough for the bit)
(Video Show: HIDE=router,hose,core)
(Video Shot: VIEW=gantry TIME=2.5 DIST=750)
(Video Text: TIME=5 TEXT=The 3D plate is cut from your design: the engraving, the pocket, the cut-throughs)
(Video Wait: TIME=5)
(Video Show: SHOW=router,core)
(Video Shot: VIEW=machine TIME=2)
(Video Text: TIME=5 TEXT=The strut plate G-code engraves it first with a V-bit, then changes to the 1/8in bit)
(Video Wait: TIME=2)
(Video Step: ID=t-run TIME=0.8)
(Video Zero: X=150 Y=150)
(Video Click: ID=home TIME=0.7)
(Video Shot: VIEW=stock TIME=1.5)
(Video Show: HIDE=Dust_Shoe*,Dust_Skirt*,Bristles_TPU*,hose)
(Video Text: TIME=4 TEXT=The dust shoe is off for this video, so you can see the bit cut)
(Video Click: ID=job-start TIME=0.8)
(Video Click: ID=start-go TIME=0.5)
G0 G54 G17 G21 G90 G94
T2
G0 Z5
M0 (MSG, Turn on the router at dial 4)
(Video Speed: X=4 REAL=2)
(Video Text: TIME=5 TEXT=A small sample of the same: the V-bit first)
G0 X10 Y40
G1 Z-1 F300
G1 X10 Y10 F900
G1 X28 Y10
G0 Z3
(Video Shot: VIEW=tool TIME=2 DIST=450)
G0 X37 Y10
G1 Z-1 F300
G1 X37 Y40 F900
G1 X50.5 Y40
G1 X55 Y35.5
G1 X55 Y29.5
G1 X50.5 Y25
G1 X37 Y25
G0 Z3
G0 X46 Y25
G1 Z-1 F300
G1 X55 Y10 F900
G0 Z3
G0 X79 Y10
G1 Z-1 F300
G1 X79 Y40 F900
G1 X64 Y19
G1 X82 Y19
G0 Z15
M0 (MSG, Turn Off Router, Change to T1 1/8in 1-flute upcut)
(Video Text: TIME=6 TEXT=The bit change: the job stops, you swap the bit and touch off Z again, then Resume)
T1
G0 X95 Y15
G0 Z3
M0 (MSG, Turn on the router at dial 4)
G1 Z-2 F180
G1 X115 F900
G1 Y18
G1 X95
G1 Y21
G1 X115
G1 Y24
G1 X95
G1 Y27
G1 X115
G1 Y30
G1 X95
G1 Y33
G1 X115
G1 Y35
G1 X95
G1 Y15
G0 Z10
(Video Shot: VIEW=stock TIME=2)
(Video Text: TIME=5 TEXT=Your design, your plate: Configure > 6 Get the files > Front plate design)
G0 Z20
M5
M30
