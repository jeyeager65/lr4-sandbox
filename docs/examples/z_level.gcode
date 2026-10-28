(PRINT, LowRider 4 Z Leveling for FluidNC 3.9.1 or higher)
(Probes two X spots, then sets the Z pulloffs so the beam is level)
(XY moves are in machine coordinates [G53]: work offsets don't matter)
(Lines must stay under 127 bytes [FluidNC])

(UPDATE REQUIRED)
#<probeY> = 50 (machine Y to probe at - a flat, uncut spot)
#<probeXLeft> = 10 (machine X, left spot - near the Min end)
#<probeXRight> = 650 (machine X, right spot - near the Max end, inside X travel)
#<zScrewSpan> = 893 (Z leadscrew center to center; LR4 26x50 model: 893)
#<zMotorLeft> = 0 (Z motor on the left/Min side: 0 or 1 - check your wiring)
#<rapidDrop> = 60 (rapid down from home; homed tip ~97 above board - MEASURE YOURS)

(UPDATE OPTIONAL)
#<minPulloff> = 4.0 (the smaller pulloff after leveling)
#<probeDist> = 60 (probe reach below rapidDrop, positive)
#<probeFeed> = 100 (probe feed)
#<probeCount> = 3 (probes per spot; Z re-homes before each)

(PRINT, Home All and Initialize)
G21 G90 G94
$H

G53 G0 X#<probeXLeft> Y#<probeY>
M0 (MSG, Attach Probe - Probing Left)
#<sum> = 0
o100 repeat [#<probeCount>]
  G91 G0 Z[0 - #<rapidDrop>]
  G38.2 Z[0 - #<probeDist>] F#<probeFeed>
  G90
  #<sum> = [#<sum> + #5063]
  (PRINT, Probe Left Z: %.3f#5063)
  $HZ
o100 endrepeat
#<left> = [#<sum> / #<probeCount>]

M0 (MSG, Detach Probe - Moving Right)
G53 G0 X#<probeXRight> Y#<probeY>
M0 (MSG, Re-attach Probe - Probing Right)
#<sum> = 0
o101 repeat [#<probeCount>]
  G91 G0 Z[0 - #<rapidDrop>]
  G38.2 Z[0 - #<probeDist>] F#<probeFeed>
  G90
  #<sum> = [#<sum> + #5063]
  (PRINT, Probe Right Z: %.3f#5063)
  $HZ
o101 endrepeat
#<right> = [#<sum> / #<probeCount>]
(PRINT, Z Average: Left=%.3f#<left>, Right=#<right>)

(The beam pivots on the leadscrews: scale the difference to their spacing)
(lift > 0: the left end sits low, so the right end goes down by lift)
#<lift> = [[#<left> - #<right>] * #<zScrewSpan> / [#<probeXRight> - #<probeXLeft>]]
(PRINT, Lift at the leadscrews: %.3f#<lift>)

o102 if [#<zMotorLeft> EQ 0]
  #<pL> = #</axes/z/motor0/pulloff_mm>
  #<pR> = #</axes/z/motor1/pulloff_mm>
o102 else
  #<pL> = #</axes/z/motor1/pulloff_mm>
  #<pR> = #</axes/z/motor0/pulloff_mm>
o102 endif

(A bigger pulloff leaves that end lower after homing)
#<newL> = #<pL>
#<newR> = [#<pR> + #<lift>]
(Shift both so the smaller one is minPulloff - keeps the difference)
o103 if [#<newL> LT #<newR>]
  #<newR> = [#<newR> + #<minPulloff> - #<newL>]
  #<newL> = #<minPulloff>
o103 else
  #<newL> = [#<newL> + #<minPulloff> - #<newR>]
  #<newR> = #<minPulloff>
o103 endif
(PRINT, Left Pulloff: Current=%.3f#<pL>, New=#<newL>)
(PRINT, Right Pulloff: Current=%.3f#<pR>, New=#<newR>)

M0 (MSG, Remove Probe - Resume Saves the New Pulloffs)
o104 if [#<zMotorLeft> EQ 0]
  #</axes/z/motor0/pulloff_mm> = #<newL>
  #</axes/z/motor1/pulloff_mm> = #<newR>
o104 else
  #</axes/z/motor1/pulloff_mm> = #<newL>
  #</axes/z/motor0/pulloff_mm> = #<newR>
o104 endif
(Rewrites config.yaml from the running config - its comments are lost)
$CD=config.yaml
G4 P0
(PRINT, Re-homing Z with the new pulloffs)
$HZ
(PRINT, Z Leveling Complete)
M30
