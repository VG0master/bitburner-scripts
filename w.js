/** @param {NS} ns */
export async function main(ns) {
	var host = ns.args[0];
	var target = ns.args[1];
	var port = ns.args[2];
	await ns.weaken(target);
	var delay = 500;
	var msg = target; //ns.sprintf("%s %s", host, target);
	while (!ns.tryWritePort(port, msg)) {
		delay = Math.min(delay*2, 60*1000);
		ns.toast(ns.sprintf("%s unable to signal completion WEAKEN", host), "warning");
		await ns.sleep(delay);
	}
}