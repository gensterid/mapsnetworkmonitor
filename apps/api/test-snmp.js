import snmp from 'net-snmp';

const host = "192.168.87.10";
const community = "public";

const oids = [
    "1.3.6.1.2.1.1.1.0",                  // SysDesc
    "1.3.6.1.4.1.34506.1.3.2.1.1.28.1.1", // ONU RX
    "1.3.6.1.4.1.34506.1.3.2.1.1.28",    // RX ROOT
];

const session = snmp.createSession(host, community);

console.log(`Checking SNMP for ${host}...`);

session.get(oids, (error, varbinds) => {
    if (error) {
        console.error("SNMP Session Error:", error);
    } else {
        for (let i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
                console.log(oids[i] + ": ERROR - " + snmp.varbindError(varbinds[i]));
            } else {
                console.log(oids[i] + ": " + varbinds[i].value);
            }
        }
    }
    session.close();
    process.exit(0);
});

setTimeout(() => {
    console.log("SNMP Timeout");
    process.exit(1);
}, 5000);
