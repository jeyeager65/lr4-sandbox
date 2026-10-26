(A short ui video for tests/test_page_help.js and tools/record_demo.js: KIND=ui - the whole page, a pointer)
(It opens the Run tab, points at Home, clicks it, starts the job with the page's own Start, and points mid-job)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=120 YMIN=0 YMAX=80 ZMIN=-6.35 ZMAX=0)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=1 LEN=12 OAL=38 NAME=1/8in 1-flute upcut)
(Video: SIZE=1280x720 FPS=30 VOLUME=0.6 PAUSE=1.5 MESSAGETIME=2 HOLD=1.5 KIND=ui)
(Video Title: TIME=1.5 TEXT=The Run tab)
(Video Step: ID=t-run TIME=0.6)
(Video Step: ID=t-run TIME=0.3)
(Video Point: ID=home TIME=1.5 TEXT=Home: every axis to its switch)
(Video Click: ID=home TIME=0.6)
(Video Click: ID=job-start TIME=0.6)
(Video Point: ID=start-go TIME=1 TEXT=The check before a job)
(Video Click: ID=start-go TIME=0.4)
G0 G54 G17 G21 G90 G94
T1
G0 Z4
G0 X30 Y30
(Video Point: ID=run-hold TIME=2 TEXT=Hold pauses a job)
G1 Z-3 F180
G3 X30 Y30 I3 J0 F900
G0 Z4
G0 X60 Y30
G1 Z-2 F180
G1 X100 F900
G0 Z10
M5
