(Tour + first job: the LR4 Sandbox page, then a name plate engraved on its own FluidNC - Help video, Part 43)
(The page plays it live: Help > Tour. YouTube: node tools/record_demo.js web/help/tour.gcode)
(KIND=ui: the whole page on screen; Step / Point / Click use the page's element ids)
(The job: node tools/help_jobs.js nameplate - LR4 SANDBOX + a border, 60 deg V-bit, 1 mm deep)
(Keep every line under 127 bytes: FluidNC stops on longer ones)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=240 YMIN=0 YMAX=70 ZMIN=-6.35 ZMAX=0)
(ToolDef 1: SHAPE=vbit D=12.7 ANGLE=60 NAME=60 deg V-bit)
(Video: KIND=ui MACHINE=26x50 FPS=30 VOLUME=0.6 PAUSE=2.5 MESSAGETIME=3 HOLD=2)
(Video Title: TIME=3 TEXT=LowRider 4 Sandbox|A quick tour)
(Video Point: ID=parts-chip TIME=5 TEXT=First, your part files: the official STLs, read in this browser only)
(Video Step: ID=st-size TIME=0.8)
(Video Point: ID=st-size TIME=4 TEXT=1 Size: your cutting area - the table, braces and plates follow it)
(Video Step: ID=st-opts TIME=0.8)
(Video Point: ID=st-opts TIME=3.5 TEXT=2 Options: router, dust shoe, hose, pendant...)
(Video Step: ID=st-ab TIME=0.8)
(Video Point: ID=st-ab TIME=4 TEXT=4 As built: your machine as it really is - racked, out of tram, a warped board)
(Video Step: ID=st-files TIME=0.8)
(Video Point: ID=st-files TIME=4 TEXT=6 Get the files: BOM, cut list, strut plate G-code, config.yaml)
(Video Step: ID=t-run TIME=0.8)
(Video Text: TIME=4 TEXT=Run: FluidNC itself, running in your browser)
(Video Wait: TIME=3)
(Video Point: ID=dro TIME=4 TEXT=Where the machine is: work and machine position)
(Video Zero: X=150 Y=150)
(Video Point: ID=home TIME=3.5 TEXT=Home first: every axis to its switch)
(Video Click: ID=home TIME=0.7)
(Video Shot: VIEW=stock TIME=1.5)
(Video Point: ID=zero-all TIME=4.5 TEXT=Zero: where the job starts - here, the stock's front-left corner)
(Video Point: ID=src-sd TIME=4 TEXT=The SD card: the G-code files FluidNC can run)
(Video Show: HIDE=Dust_Shoe*,Dust_Skirt*,Bristles_TPU*,hose)
(Video Text: TIME=4 TEXT=The dust shoe is off for this video, so you can see the bit cut)
(Video Click: ID=job-start TIME=0.8)
(Video Point: ID=start-go TIME=3.5 TEXT=A check before it runs: homed, zero, the bit, the stock)
(Video Click: ID=start-go TIME=0.5)
G0 G54 G17 G21 G90 G94
T1
G0 Z5
M0 (MSG, Turn on the router at dial 4)
(Video Speed: X=5 REAL=3)
(Video Text: TIME=5 TEXT=Engraving at 5x - the first cut of each part plays in real time)
G0 X14.4 Y46
G1 Z-1 F300
G1 X14.4 Y24 F900
G1 X27.6 Y24
G0 Z3
(Video Shot: VIEW=tool TIME=2 DIST=380)
G0 X34.2 Y24
G1 Z-1 F300
G1 X34.2 Y46 F900
G1 X44.1 Y46
G1 X47.4 Y42.7
G1 X47.4 Y38.3
G1 X44.1 Y35
G1 X34.2 Y35
G0 Z3
G0 X40.8 Y35
G1 Z-1 F300
G1 X47.4 Y24 F900
G0 Z3
G0 X65 Y24
G1 Z-1 F300
G1 X65 Y46 F900
G1 X54 Y30.6
G1 X67.2 Y30.6
G0 Z3
(Video Point: ID=run-hold TIME=4 TEXT=Hold pauses the job, Stop ends it)
G0 X106.8 Y42.7
G1 Z-1 F300
G1 X103.5 Y46 F900
G1 X96.9 Y46
G1 X93.6 Y42.7
G1 X93.6 Y38.3
G1 X96.9 Y35
G1 X103.5 Y35
G1 X106.8 Y31.7
G1 X106.8 Y27.3
G1 X103.5 Y24
G1 X96.9 Y24
G1 X93.6 Y27.3
G0 Z3
G0 X113.4 Y24
G1 Z-1 F300
G1 X120 Y46 F900
G1 X126.6 Y24
G0 Z3
G0 X115.71 Y31.7
G1 Z-1 F300
G1 X124.29 Y31.7 F900
G0 Z3
(Video Shot: VIEW=stock TIME=2)
G0 X133.2 Y24
G1 Z-1 F300
G1 X133.2 Y46 F900
G1 X146.4 Y24
G1 X146.4 Y46
G0 Z3
G0 X153 Y24
G1 Z-1 F300
G1 X153 Y46 F900
G1 X160.7 Y46
G1 X166.2 Y40.5
G1 X166.2 Y29.5
G1 X160.7 Y24
G1 X153 Y24
G0 Z3
G0 X172.8 Y24
G1 Z-1 F300
G1 X172.8 Y46 F900
G1 X182.7 Y46
G1 X186 Y42.7
G1 X186 Y38.3
G1 X182.7 Y35
G1 X172.8 Y35
G0 Z3
G0 X182.7 Y35
G1 Z-1 F300
G1 X186 Y31.7 F900
G1 X186 Y27.3
G1 X182.7 Y24
G1 X172.8 Y24
G0 Z3
G0 X195.9 Y24
G1 Z-1 F300
G1 X192.6 Y27.3 F900
G1 X192.6 Y42.7
G1 X195.9 Y46
G1 X202.5 Y46
G1 X205.8 Y42.7
G1 X205.8 Y27.3
G1 X202.5 Y24
G1 X195.9 Y24
G0 Z3
G0 X212.4 Y24
G1 Z-1 F300
G1 X225.6 Y46 F900
G0 Z3
G0 X212.4 Y46
G1 Z-1 F300
G1 X225.6 Y24 F900
G0 Z3
(MSG, The border)
G0 X6 Y6
G1 Z-1 F300
G1 X234 Y6 F900
G1 X234 Y64
G1 X6 Y64
G1 X6 Y6
G0 Z3
(Video Text: TIME=5 TEXT=Done. Your turn: open Run, Home, Zero, and Start a file from the SD card)
G0 Z10
M5
M30
