const CONTROL_PORT = 5;
const MONEY_BUFFER = 0.05;
const SEC_BUFFER = 1;

/** @param {NS} ns */
export async function main(ns) {
	disableLogs(ns);
	if (ns.args[0] == "attack") {
		ns.clearPort(CONTROL_PORT);
		attack(ns);
		return;
	} else if (ns.args[0] == "prep") {
		ns.clearPort(CONTROL_PORT);
		worker(ns, true);
		return;
	} else if (ns.args[0] == "shutdown") {
		ns.writePort(CONTROL_PORT, "SHUTDOWN");
		return;
	} else if (ns.args[0] == "top") {
		top(ns);
		return;
	} else if (ns.args[0] == "worker") {
		ns.clearPort(CONTROL_PORT);
		worker(ns, false);
		return;
	} else {
		ns.tprintf("Unknown command '%s'", ns.args[0]);
	}
}

/** @param {NS} ns */
function printServers(ns, servers) {
	ns.tprintf("Host\t\t\t    HL\t     free\t      RAM\t     SEC\t  Money\t    Max\t Ratio", "Host");
	var i = 0;
	for (let server of servers) {
		var n = server.Name;
		ns.tprintf("%02d %-16s\t%6s\t%9s\t%9s\t%5s+%5s\t%7s\t%7s\t%6s",
			++i,
			n,
			n != "home" ? ns.formatNumber(server.HackLevel, 0, 1000000) : "N/A",
			ns.formatRam(server.Memory - ns.getServerUsedRam(n)),
			ns.formatRam(server.Memory),
			n != "home" ? ns.formatNumber(server.MinSec, 2) : "N/A",
			n != "home" ? ns.formatNumber(ns.getServerSecurityLevel(n) - server.MinSec, 2) : "N/A",
			n != "home" ? ns.formatNumber(ns.getServerMoneyAvailable(n), 2) : "N/A",
			n != "home" ? ns.formatNumber(server.MaxMoney, 2) : "N/A",
			server.MaxMoney > 0 ? ns.formatPercent(ns.getServerMoneyAvailable(n) / server.MaxMoney) : "N/A");
	}
}

/** @param {NS} ns */
function attack(ns) {
	if (ns.args.length < 6) {
		ns.tprintf("cc attack <tag> <skipCount> <targetCount> <workersPerTarget> <maxThreads>");
		return;
	}
	var tag = ns.args[1];
	var skipCount = ns.args[2];
	var targetCount = ns.args[3];
	var workersPerTarget = ns.args[4];
	var maxThreads = ns.args[5];
	var script = "wgh.js";
	var servers = findServers(ns);
	var targets = topMoneyTargets(ns, servers, targetCount+skipCount);
	while (skipCount > 0 && targets.length > 0) {
		var t = targets.shift();
		ns.tprintf("Ignoring target: %s", t.Name);
		skipCount--;
	}
	for (let target of targets) {
		var targetMoney = target.MaxMoney * (1 - MONEY_BUFFER);
		var targetSec = target.MinSec + SEC_BUFFER;
		var workers = topWorkers(ns, servers, workersPerTarget);
		for (let worker of workers) {
			if (worker.Name != "home" && !ns.scp(script, worker.Name)) {
				ns.tprintf("Unable to deploy script to '%s'.", worker.Name);
				continue;
			}
			var scriptMemory = ns.getScriptRam(script, worker.Name);
			var hostMemory = worker.Memory - ns.getServerUsedRam(worker.Name);
			if (scriptMemory > hostMemory) {
				ns.tprintf("Not enough memory (%s) to start script (%s) on '%s'", ns.formatRam(hostMemory), ns.formatRam(scriptMemory), worker.Name);
				continue;
			}
			var threads = Math.min(maxThreads, Math.max(1, Math.floor(hostMemory / scriptMemory)));
			ns.tprintf("Will use %d threads attacking '%s' from '%s'", threads, target.Name, worker.Name);
			if (0 >= ns.exec(script, worker.Name, threads, target.Name, threads, targetMoney, targetSec, CONTROL_PORT, tag)) {
				ns.tprint("Failed to execute script.");
				continue;
			}
		}
	}
}

/** @param {NS} ns */
function top(ns) {
	var count = ns.args[1];
	var what = ns.args[2];
	var servers = findServers(ns);
	var uhl = ns.getHackingLevel();
	if (what == "max") {
		servers = topMoneyTargets(ns, servers, count);
	} else if (what == "cash") {
		servers = servers.filter(s => s.Name != "home" && uhl >= s.HackLevel);
		servers.sort(function (a, b) { return ns.getServerMoneyAvailable(b.Name) - ns.getServerMoneyAvailable(a.Name); });
	} else if (what == "ram") {
		servers = servers.filter(s => s.Memory > 0);
		servers.sort(function (a, b) { return b.Memory - a.Memory; });
	} else if (what == "threads") {
		servers = topWorkers(ns, servers, count);
	} else if (what == "next") {
		servers = topPrepTargets(ns, servers, count);
	} else if (what == "last") {
		servers = servers.filter(s => s.HackLevel <= uhl);
		servers.sort(function (a, b) { return b.HackLevel - a.HackLevel; });
	} else {
		ns.tprintf("Unknown command 'top %d %s'", count, what);
		return;
	}
	servers.length = Math.min(count, servers.length);
	printServers(ns, servers);
}

/** @param {NS} ns */
function worker(ns, prepMode) {
	if (ns.args.length < 6) {
		ns.tprintf("cc worker <tag> <skipCount> <targetCount> <maxThreads> <workerName>");
		return;
	}
	var tag = ns.args[1];
	var skipCount = ns.args[2]
	var targetCount = ns.args[3];
	var maxThreads = ns.args[4];
	var workerName = ns.args[5];
	var script = prepMode?"wg.js":"wgh.js";
	var servers = findServers(ns);
	var worker = servers.filter((x) => x.Name == workerName).shift();
	var targets = prepMode?topPrepTargets(ns, servers, targetCount+skipCount):topMoneyTargets(ns, servers, targetCount+skipCount);
	while (skipCount > 0 && targets.length > 0) {
		var t = targets.shift();
		ns.tprintf("Ignoring target: %s", t.Name);
		skipCount--;
	}
	if (worker.Name != "home" && !ns.scp(script, worker.Name)) {
		ns.tprintf("Unable to deploy script to '%s'.", worker.Name);
		return;
	}
	var scriptMemory = ns.getScriptRam(script, worker.Name);
	var hostMemory = worker.Memory - ns.getServerUsedRam(worker.Name);
	if (scriptMemory > hostMemory) {
		ns.tprintf("Not enough memory (%s) to start script (%s) on '%s'", ns.formatRam(hostMemory), ns.formatRam(scriptMemory), worker.Name);
		return;
	}
	var threads = Math.min(maxThreads, Math.max(1, Math.floor(hostMemory / scriptMemory / targets.length)));
	for (let target of targets) {
		var targetMoney = target.MaxMoney * (1 - MONEY_BUFFER);
		var targetSec = target.MinSec + SEC_BUFFER;
		ns.tprintf("Will use %d threads targeting '%s' from '%s'", threads, target.Name, worker.Name);
		if (0 >= ns.exec(script, worker.Name, threads, target.Name, threads, targetMoney, targetSec, CONTROL_PORT, tag)) {
			ns.tprint("Failed to execute script.");
			continue;
		}
	}
}

/** @param {NS} ns */
function topMoneyTargets(ns, servers, count) {
	var uhl = ns.getHackingLevel();
	var targets = servers.filter(s => s.Name != "home" && uhl >= s.HackLevel && s.MaxMoney > 0);
	targets.sort(function (a, b) { return b.MaxMoney - a.MaxMoney; });
	targets.length = Math.min(count, targets.length);
	return targets;
}

/** @param {NS} ns */
function topPrepTargets(ns, servers, count) {
	var uhl = ns.getHackingLevel();
	var targets = servers.filter(s => s.HackLevel > uhl);
	targets.sort(function (a, b) { return a.HackLevel - b.HackLevel; });
	targets.length = Math.min(count, targets.length);
	return targets;
}

/** @param {NS} ns */
function topWorkers(ns, servers, count) {
	var targets = servers.filter(s => s.Memory > 0);
	targets.sort(function (a, b) { return (b.Memory - ns.getServerUsedRam(b.Name)) - (a.Memory - ns.getServerUsedRam(a.Name)); });
	targets.length = Math.min(count, targets.length);
	return targets;
}

/** @param {NS} ns */
function findServers(ns) {
	var checked = { "home": true };
	var servers = [];
	var home = {
		Name: "home",
		Memory: ns.getServerMaxRam("home") - ns.getScriptRam(ns.getScriptName()),
	};
	servers = servers.concat(home);
	var queue = ns.scan("home");
	while (queue.length > 0) {
		var target = queue.pop();
		if (checked[target] == true) {
			continue;
		}
		checked[target] = true;
		queue = queue.concat(ns.scan(target));
		const portsOpen = openPorts(ns, target);
		if (!ns.hasRootAccess(target)) {
			if (portsOpen < ns.getServerNumPortsRequired(target)) {
				ns.printf("[%s] PORTS missing ", target);
				continue;
			}
			ns.nuke(target);
			ns.toast(ns.sprintf("[%s] NUKEd", target), "success", 5000);
		}
		var t = {
			Name: target,
			MinSec: ns.getServerMinSecurityLevel(target),
			MaxMoney: ns.getServerMaxMoney(target),
			Memory: ns.getServerMaxRam(target),
			HackLevel: ns.getServerRequiredHackingLevel(target),
		};
		servers = servers.concat(t);
	}
	ns.toast(ns.sprintf("%d servers found", servers.length), "info", 5000);
	return servers;
}

/** @param {NS} ns */
function openPorts(ns, target) {
	var ports = 0;
	if (ns.fileExists("BruteSSH.exe", "home")) {
		ns.brutessh(target);
		ports++;
	}
	if (ns.fileExists("FTPCrack.exe", "home")) {
		ns.ftpcrack(target);
		ports++;
	}
	if (ns.fileExists("relaySMTP.exe", "home")) {
		ns.relaysmtp(target);
		ports++;
	}
	if (ns.fileExists("HTTPWorm.exe", "home")) {
		ns.httpworm(target);
		ports++;
	}
	if (ns.fileExists("SQLInject.exe", "home")) {
		ns.sqlinject(target);
		ports++;
	}
	return ports;
}

/** @param {NS} ns */
function deploy(ns, host) {
	if (host == "home") {
		return;
	}
	if (!ns.scp(["h2.js", "w2.js", "g2.js"], host)) {
		log(ns, ns.sprintf("[%s] Failed to deploy scripts", host), "error", 10000);
	}
}

/** @param {NS} ns */
function log(ns, msg, severity, duration) {
	ns.print(msg);
	ns.toast(msg, severity, duration);
}

/** @param {NS} ns */
function disableLogs(ns) {
	ns.disableLog("ALL");
}

/** @param {NS} ns */
function traceExec(ns) {
	ns.enableLog("exec");
}