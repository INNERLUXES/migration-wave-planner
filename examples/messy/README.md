# A messy inventory

Quillmoor, a made-up online shop, the way its inventory looked before the first wave was planned. The orders API and
the pricing service depend on each other, the test runner depends on itself, the billing service names a ledger
database by an id that is not in the file and still depends on a fax gateway marked retire and on mainframe batch jobs
marked retain, the rates cache has no owner and writes its path as Lift and Shift, the reports portal has the path
rehoist, the developer sandbox has no path at all, the sign-in service is listed twice, and the last row has four
fields where the header has nine. The notes column is not a column the tool reads.

It also holds what must not be reported: the old intranet depends on the fax gateway, but both are retired; the path
move as is, which `examples/config.json` adds as another name of rehost; and the name of the orders API, a quoted
field that holds a comma.
