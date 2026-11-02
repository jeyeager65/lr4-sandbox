# Wiring - what the LowRider 4 on a Jackpot 3 connects, and with what (Part 51a.1, 2026-11-01)

The sources for the page's wiring list (`web/data/wiring.js`). Anything not from a source below is marked GUESS -
measure yours and say so (CONFIGURATOR.md Part 51).

## The Jackpot 3 board ([V1E docs](https://docs.v1e.com/electronics/jackpot3/))

Pinout image: [jp3label.png](https://github.com/V1EngineeringInc/V1EngineeringInc-Docs/blob/master/docs/img/jackpot/jackpot3/jp3label.png)
(the docs' Wiring section). Seen with the stepper headers along the top edge:

| Header | Kind | LowRider |
|---|---|---|
| Motor X (right-most) | 4 pins, open 2.54 mm male | X (the core) |
| Motor Y | " | Y0 |
| Motor Z | " | Z0 |
| Motor A | " | Y1 |
| Motor B | " | Z1 |
| Motor C (left-most) | " | - (spare) |
| Inputs (2 x 7, 2.54 mm, signal + ground per GPIO) 25 | endstop, NC | X |
| 33 | " | Y0 |
| 32 | " | Z0 |
| 35 | " | Y1 |
| 34 | " | Z1 |
| 39 | " | - (spare) |
| 36 | probe, NO | the touch plate: the plate to S(ignal), the clip to G(round) |
| Power input (left edge, 2 pins) | 9-29 V DC, reverse-polarity protected | the 24 V supply |
| Outputs 2 / 0 / 27 / 26 (right side, 24 V and 5 V rows) | 1 A, 2.5 A peak | - (the lid fan is usually wired to the power input: always on) |
| RJ11 | pendant / expander | - |

Which side is Y0 / Z0: the FluidNC config's motor0 - **GUESS: the Min end (X = 0 side)**; the docs don't say.
Endstops are only read while homing (not limit switches). All inputs: active low, 10k pull-up.

## Wires ([V1E shop](https://www.v1e.com/collections/lowrider-parts))

- **Stepper extender wires** ([wiring-kit-1](https://www.v1e.com/products/wiring-kit-1)): a set of 3 for a LowRider;
  each 1.5 m (~5'), 26 AWG, 6 wires: a stepper's 4 + its endstop's 2 ("6 wires for endstops as well as the steppers").
  "Matching clip side to clip side" sets the direction; flip a plug to reverse. The LowRider's 3 (bom.py SPECIALTY):
  **the core (X motor + X endstop), Y1 and Z1 (the far motors + their endstops)** - the near Y0 / Z0 motors reach on
  their own leads. Ribbon look (6 silicone wires, one striped), connector types: GUESS until measured (Part 46 notes).
- **Steppers** ([Nema 17 84 oz-in](https://www.v1e.com/products/nema-17-76oz-in-steppers)): leads "approximately 30""
  (~760 mm), 4 wires (black / green / red / blue as drawn - GUESS order), a 4-pin plug.
- **Endstops** ([limit switch](https://www.v1e.com/products/limit-switch-endstop)): Omron SS-3GL13PT, NC / NO, solder or
  2.8 mm female spades; bare - every switch gets the builder's own 2-wire lead ("crimped or soldered endstop", out the
  bottom of the YZ plate): the near ones (Y0, Z0) to the board, the far ones (Y1, Z1, X) to their motor's extender join,
  spliced to its 2 spare wires (w3). Lengths per size: the page's BOM (wiring.js fit).
- **Wire sleeve** ([wire-sleeve](https://www.v1e.com/products/wire-sleeve)): 3/8" PET, by the foot - the core's
  bundle (the X extender + the touch plate's leads) along the hose (hose_bom.js).
- **Power supply** ([24V](https://www.v1e.com/products/24v-power-supply)): 24 V 2.5 A (60 W), a barrel plug - "cut it
  off, strip the wires and connect directly"; mains in by an IEC C5 / C13 cord.
- **Touch plate**: the plate's wire (red) + the clip's (black) out of the core's hole (rope.js) to the probe input,
  in the sleeve (GUESS: one 2-wire lead).

## Routing

Source: V1E docs, LowRider "Wire Routing" (docs/lowrider/index.md, photos img/lr4/w1a-w9f; local clone
D:\GitHub\V1EngineeringInc-Docs). What the docs say:

- The board goes on the **YZ_Min side, first bay** (wiring + SD access) - the model's Jackpot box placement.
- Y / Z wires leave the YZ assembly low on its inner face (w1), go **into the beam at full height** and are tied
  **at each brace - top or bottom, both fine** (w4, w5b: top helps with dust). The model: brace bottoms.
- YZ_Max's motors + endstops and the core's runs use **extensions**; each join folded back and taped (strain relief),
  labelled (w2, w3). The spare length is pulled to the furthest section and folded into a bundle (w4, w5).
- The core's wires: tied at the core's top (first position) with the core at X_Max, a small loop there; along the
  router cord / vac hose through the hose hooks to the **brace just past halfway**, then into the braces with the
  others (w7, w8, w8b). The wires pass under the hose at the middle; a partial twist if it tracks badly.

- Power (w9c-w9e): the supply rides the gantry (in a bay, on the strut plates); its mains "out with the vacuum hose,
  or a single extension cord into the beam". The model (user 2026-11-02: in the beam through the braces; the router
  cord along the hose): the switch panel (table front) -> along the front to the gantry end nearer the supply -> its
  YZ plate -> the braces -> the supply (~3.0 m at 26x50, 1.6 m at 15x30, 4.7 m at 48x96). Part 52 moves the start to
  a power inlet + outlets on the table's left (Min) end, where the hose leaves the table.

Still GUESS (the user's machine): the exact exit point on the YZ plate, the tie points' heights, and the core
bundle's sag / loop size. The model's "+75 mm per end" allowance covers the joins and the loops.
