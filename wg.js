/** @param {NS} ns */
export async function main(ns) {
	var target = ns.args[0];
	var moneyLimit = ns.getServerMaxMoney(target);
	var secLimitLow = ns.getServerMinSecurityLevel(target);
	var ti = ns.getRunningScript();
	var secLimitHigh = secLimitLow + ti.threads * 0.05;
	var money = ns.getServerMoneyAvailable(target);
	var sec = ns.getServerSecurityLevel(target);
	while (money < moneyLimit || sec > secLimitLow) {
		if (sec > secLimitHigh) {
			await ns.weaken(target);
		} else if (money < moneyLimit) {
			await ns.grow(target);
		} else if (sec > secLimitLow) {
			await ns.weaken(target);
		}
		money = ns.getServerMoneyAvailable(target);
		sec = ns.getServerSecurityLevel(target);
	}
	ns.toast(ns.sprintf("%s prepared.", target), "success", 5000);
}