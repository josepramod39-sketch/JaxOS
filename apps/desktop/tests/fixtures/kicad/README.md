# KiCad CLI integration fixtures

A two-pin interconnect, with two connectors, two nets, two copper traces and an explicit board outline. `clean/` has zero ERC and DRC findings with KiCad 9.0.2. `fault/` deliberately omits the second schematic wire and PCB trace: ERC reports two disconnected pins; DRC reports one unconnected net. No checker rules or expected report files were altered to produce these results.

The circuit and routing were created for JaxOS tests. Embedded/local `Connector_Generic:Conn_01x02` and `Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical` assets and project settings come from installed KiCad libraries. CC BY-SA 4.0 with KiCad's electronic-design exception; full notices preserved alongside this file. Sources: https://gitlab.com/kicad/libraries/kicad-symbols, https://gitlab.com/kicad/libraries/kicad-footprints, https://gitlab.com/kicad/libraries/kicad-templates.

These files validate software integration, connectivity checks and export production. They do not establish physical hardware performance or manufacturer approval.
