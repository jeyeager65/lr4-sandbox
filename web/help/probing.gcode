(Probing + zero: X and Y from homing, Z from the touch plate - Help video, Part 43)
(The page plays it live: Help > Probing and zero. YouTube: node tools/record_demo.js web/help/probing.gcode)
(KIND=ui: the whole page on screen. Keep every line under 127 bytes: FluidNC stops on longer ones)
(CNCSIM 1 UNITS=mm)
(Stock: XMIN=0 XMAX=160 YMIN=0 YMAX=100 ZMIN=-12.7 ZMAX=0)
(ToolDef 1: SHAPE=flat D=3.175 FLUTES=1 LEN=12 OAL=38 NAME=1/8in 1-flute upcut)
(Video: KIND=ui MACHINE=26x50 FPS=30 VOLUME=0.6 PAUSE=3 MESSAGETIME=4 HOLD=2)
(Video Title: TIME=3 TEXT=Probing and zero|Where is the stock, exactly?)
(Video Step: ID=t-run TIME=0.8)
(Video Text: TIME=5 TEXT=Work zero: the point the job's X0 Y0 Z0 means - here, the stock's front-left top corner)
(Video Wait: TIME=3)
(Video Zero: X=150 Y=150)
(Video Point: ID=home TIME=3 TEXT=Home first: the machine learns where it is)
(Video Click: ID=home TIME=0.7)
(Video Shot: VIEW=stock TIME=1.5)
(Video Text: TIME=5 TEXT=X and Y: jogged to the stock's corner, measured from the switches)
(Video Point: ID=zero-x TIME=4.5 TEXT=Zero X, Y or Z sets that axis' zero right where the bit is)
(Video Point: ID=zero-all TIME=3 TEXT=Zero All sets all three)
(Video Point: ID=ctl-plate TIME=5 TEXT=Z is the hard one: a touch plate finds the stock's top for you)
(Video Show: HIDE=Dust_Shoe*,Dust_Skirt*,Bristles_TPU*,hose)
(Video Text: TIME=4 TEXT=The dust shoe is off for this video, so you can see the bit cut)
(Video Click: ID=job-start TIME=0.8)
(Video Click: ID=start-go TIME=0.5)
G0 G54 G17 G21 G90 G94
T1
G10 L20 P0 X0 Y0 Z0
G0 X8 Y8
(Video Speed: X=5 REAL=0)
(Video Shot: VIEW=tool TIME=2 DIST=300)
M0 (MSG, Clip the probe to the collet nut, the plate under the bit)
(Video Text: TIME=6 TEXT=G38.2: down till the bit touches the plate - the clip closes the circuit. Here at 5x)
G38.2 Z-110 F200 P0.5
(Video Text: TIME=6 TEXT=P0.5: the plate is 0.5 mm thick, so FluidNC sets Z0 that far below the touch)
G0 Z10
M0 (MSG, Remove the plate and the clip, then turn on the router at dial 3)
(Video Point: ID=wz TIME=4 TEXT=Z work position: zero is now the stock's top)
(Video Speed: X=4 REAL=3)
(MSG, A 1 mm deep pocket shows the depth is right)
G0 X30 Y30
G1 Z-1 F180
G1 X130 F900
G1 Y35
G1 X30
G1 Y40
G1 X130
G1 Y45
G1 X30
G1 Y50
G1 X130
G1 Y30
G1 X30
G1 Y50
G0 Z10
(Video Shot: VIEW=stock TIME=2)
(Video Text: TIME=5 TEXT=Probe again after every bit change: each bit sticks out a different length)
G0 Z15
M5
M30
