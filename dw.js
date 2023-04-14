/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog("ALL");
	var params = ns.flags([
		['help', false],
		['host', ''],
		['target', []],
		['cmd_port', 5],
		['ctrl_port', 6],
		['tag', 'T'],
		['threads', 1000],
		['steal', 0.75],
	]);
	var stealRatio = params['steal'];
	if (params['host'].length == 0 || stealRatio <= 0 || stealRatio > 1) {
		params['help'] = true;
	}
	//ns.tprint(params);
	if (params['help']) {
		ns.tprintf("Usage: run dw.js --host <host> [options]");
		ns.tprintf("  --host <name>\tHost to run script.");
		ns.tprintf("  --target <name>\tTarget for attack (can give multiple) (default: all).");
		ns.tprintf("  --cmd_port <n>\tPort to communicate with parent (default: 5).");
		ns.tprintf("  --ctrl_port <n>\tPort to communicate with children (default: 6).");
		ns.tprintf("  --steal <n>\tRatio of max money to steal (default: 0.75).");
		ns.tprintf("  --tag <s>\tTag prefix for all child tasks (default: 'T').");
		ns.tprintf("  --threads <n>\tMax number of threads to use (default: 1000).");
		ns.tprintf("  --help <bool>\tIf true, show this help (default false).");
		return;
	}
	var host = params['host'];
	var commandPort = ns.getPortHandle(params['cmd_port']);
	var controlPort = ns.getPortHandle(params['ctrl_port']);
	ns.clearPort(params['cmd_port']);
	ns.clearPort(params['ctrl_port']);
	var dynamicTargets = params['target'].length == 0;
	var queue = dynamicTargets ? [] : params['target'].map((x) => x);
	var servers = dynamicTargets ? [] : findServers(ns);
	var jobs = {};
	await ns.sleep(1000);
	if (ns.ps(host).filter((x) => { return ["w.js", "g.js", "h.js"].includes(x.filename); })) {
		ns.printf("Other scripts seems to be running.");
		await ns.sleep(4000);
	}
	for (let p of ns.ps(host)) {
		if (["w.js", "g.js", "h.js"].includes(p.filename)) {
			var tn = p.args[1];
			jobs[tn] = "ACTIVE";
		}
	}
	var tagN = 0;
	while (commandPort.empty()) {
		while (!controlPort.empty()) {
			var msg = controlPort.read();
			if (msg == "STATUS") {
				ns.printf("Current jobs:");
				for (let j in jobs) {
					ns.printf("%6s %s", jobs[j], j);
				}
				for (let q of queue) {
					ns.printf("%6s %s", "QUEUE", q);
				}
				continue;
			} else if (msg == "RESCAN") {
				for (let t of topMoneyTargets(ns, servers)) {
					if (!dynamicTargets || t.Name in job || queue.includes(t.Name)) {
						continue;
					}
					queue.push(nt.Name);
					ns.printf("Adding %s to queue", t.Name);
				}
				continue;
			}
			queue.push(msg);
			delete jobs[msg];
			//ns.printf("%s completed", msg);
		}
		if (queue.length == 0) {
			if (dynamicTargets) {
				var newServers = findServers(ns);
				var newTargets = topMoneyTargets(ns, newServers);
				var oldTargets = topMoneyTargets(ns, servers);
				if (newTargets.length > oldTargets.length) {
					for (let nt of newTargets) {
						if (oldTargets.filter((x) => x.Name == nt.Name).length > 0) {
							continue;
						}
						queue.push(nt.Name);
						ns.printf("Adding %s to queue", nt.Name);
					}
				}
				if (newServers.length > servers.length) {
					servers = newServers;
				}
			}
			await ns.share();
			continue;
		}
		var tn = queue.shift();
		if (tn in jobs) {
			ns.printf("%s already running!", tn);
			continue;
		}
		var target = servers.filter((x) => x.Name == tn)[0];
		var secMin = ns.getServerMinSecurityLevel(target.Name);
		var sec = ns.getServerSecurityLevel(target.Name);
		if (sec > (secMin + 1)) {
			var threads = Math.min(weakenThreads(ns, host, sec - secMin), hostThreads(ns, host, "w.js", params['threads']));
			if (threads == 0) {
				ns.printf("Unable to start w.js targeting %s", target.Name);
				continue;
			}
			if (0 >= ns.exec("w.js", host, threads, host, target.Name, params['ctrl_port'], ns.sprintf("%s%d", params['tag'], tagN++))) {
				ns.printf("Unable to execute w.js targeting %s", target.Name);
				continue;
			}
			jobs[target.Name] = "WEAKEN";
			continue;
		}
		var cashMax = ns.getServerMaxMoney(target.Name);
		var cash = ns.getServerMoneyAvailable(target.Name);
		if (cash < cashMax) {
			var threads = Math.min(growThreads(ns, host, target.Name, cash, cashMax), hostThreads(ns, host, "g.js", params['threads']));
			if (threads == 0) {
				ns.printf("Unable to start g.js targeting %s", target.Name);
				continue;
			}
			if (0 >= ns.exec("g.js", host, threads, host, target.Name, params['ctrl_port'], ns.sprintf("%s%d", params['tag'], tagN++))) {
				ns.printf("Unable to execute g.js targeting %s", target.Name);
				continue;
			}
			jobs[target.Name] = "GROW";
			continue;
		}
		var threads = Math.min(hackThreads(ns, target.Name, cash - (cashMax * (1 - stealRatio))), hostThreads(ns, host, "h.js", params['threads']));
		if (threads == 0) {
			ns.printf("Unable to start h.js targeting %s", target.Name);
			continue;
		}
		if (0 >= ns.exec("h.js", host, threads, host, target.Name, params['ctrl_port'], ns.sprintf("%s%d", params['tag'], tagN++))) {
			ns.printf("Unable to execute h.js targeting %s", target.Name);
			continue;
		}
		jobs[target.Name] = "HACK";
	}
	
	var jc = Object.keys(jobs).length + 1;
	while (Object.keys(jobs).length > 0) {
		if (jc > Object.keys(jobs).length) {
			ns.printf("Waiting for %d jobs to complete", Object.keys(jobs).length);
			jc = Object.keys(jobs).length;
		} else {
			await ns.share();
		}
		while (!controlPort.empty()) {
			var msg = controlPort.read();
			if (msg == "STATUS") {
				ns.printf("Current jobs:");
				for (let j in jobs) {
					ns.printf("%6s %s", jobs[j], j);
				}
				continue;
			}
			delete jobs[msg];
			//ns.printf("%s completed", msg);
		}
	}
}

/** @param {NS} ns */
function topMoneyTargets(ns, servers) {
	var uhl = ns.getHackingLevel();
	var targets = servers.filter(s => s.Name != "home" && uhl >= s.HackLevel && s.MaxMoney > 0);
	targets.sort(function (a, b) { return b.MaxMoney - a.MaxMoney; });
	return targets;
}

/** @param {NS} ns */
function hostThreads(ns, host, script, maxThreads) {
	var scriptMemory = ns.getScriptRam(script, host);
	var hostMemory = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
	if (scriptMemory > hostMemory) {
		return 0;
	}
	return Math.min(maxThreads, Math.max(1, Math.floor(hostMemory / scriptMemory)));
}

/** @param {NS} ns */
function weakenThreads(ns, host, needed) {
	var cores = ns.getServer(host).cpuCores;
	for (var t = 1; t < 100000; t++) {
		if (ns.weakenAnalyze(t, cores) > needed) {
			return Math.max(1, t - 1);
		}
	}
	return 100000;
}

/** @param {NS} ns */
function growThreads(ns, host, target, cash, cashTarget) {
	if (cash >= cashTarget) return 0;
	var cores = ns.getServer(host).cpuCores;
	for (var t = 1; t < 100000; t++) {
		var c = cash + t;
		var m = cashTarget / c;
		var gt = ns.growthAnalyze(target, m, cores);
		//ns.tprintf("t=%d c=%s m=%s gt=%s", t, ns.formatNumber(c,2,1000), ns.formatNumber(m,3), ns.formatNumber(gt,3));
		if (t >= gt) {
			return Math.max(1, Math.floor(gt));
		}
	}
	return 100000;
}

/** @param {NS} ns */
function hackThreads(ns, target, money) {
	if (money <= 0) {
		return 0;
	}
	return Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, money)));
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
				//ns.printf("[%s] PORTS missing ", target);
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
	//ns.toast(ns.sprintf("%d servers found", servers.length), "info", 5000);
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
	if (!ns.scp(["h.js", "w.js", "g.js"], host)) {
		log(ns, ns.sprintf("[%s] Failed to deploy scripts", host), "error", 10000);
	}
}