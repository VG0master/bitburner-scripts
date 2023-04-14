/** @param {NS} ns */
export async function main(ns) {
	var target = ns.args[0];
	var threads = ns.args[1];
	var moneyLimit = ns.args[2];
	var secLimitLow = ns.args[3];
	var controlPort = ns.getPortHandle(ns.args[4]);
	var secLimitHigh = secLimitLow + (threads * 0.05);
	var money = ns.getServerMoneyAvailable(target);
	var sec = ns.getServerSecurityLevel(target);
	var waitTime = Math.random() * 120;
	ns.printf("Waiting for %d seconds before start", Math.floor(waitTime));
	await ns.sleep(Math.floor(waitTime * 1000));
	while (controlPort.empty()) {
		if (sec > secLimitHigh) {
			var r = await ns.weaken(target);
			//ns.toast(ns.sprintf("%s WEAKENed %s", target, ns.formatNumber(r, 2, 1000)), "info");
		} else if (money < moneyLimit) {
			var r = await ns.grow(target);
			//ns.toast(ns.sprintf("%s GROWed %s", target, ns.formatPercent(r-1, 2)), "info");
		} else {
			var r = await ns.hack(target);
			//ns.toast(ns.sprintf("%s HACKed %s", target, ns.formatNumber(r, 0, 1000)), r==0?"warning":"info");
		}
		money = ns.getServerMoneyAvailable(target);
		sec = ns.getServerSecurityLevel(target);
	}
	ns.toast(ns.sprintf("wgh.js targeting %s stopped.", target), "success", 5000);
}