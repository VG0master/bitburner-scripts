/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog("ALL");
	ns.tail();
	var maxNodes = ns.args[0];
	var minCash = ns.args[1];

	maxNodes = Math.min(maxNodes, ns.hacknet.maxNumNodes());
	var ownedNodes = ns.hacknet.numNodes();
	var current = 0;
	var cashNeeded = 0;
	while (current < maxNodes) {
		if ((minCash + cashNeeded) > ns.getServerMoneyAvailable("home")) {
			ns.printf("Not enough money to make next purchase.");
			await ns.share();
			continue;
		}
		if (ownedNodes <= current) {
			if (cashNeeded == 0) {
				cashNeeded = ns.hacknet.getPurchaseNodeCost();
				ns.printf("Need %s for next node", ns.formatNumber(cashNeeded, 3, 1000));
				continue;
			}
			if (-1 == ns.hacknet.purchaseNode()) {
				ns.tprintf("Failed to purchase hack node!");
				ns.toast("Failed to purchase hack node!", "error", null);
				return;
			}
			ns.printf("Purchased new node");
			cashNeeded = 0;
			ownedNodes = ns.hacknet.numNodes();
			continue;
		}
		var levelCost = ns.hacknet.getLevelUpgradeCost(current, 1);
		var ramCost = ns.hacknet.getRamUpgradeCost(current, 1);
		var coreCost = ns.hacknet.getCoreUpgradeCost(current, 1);
		var minCost = Math.min(levelCost, ramCost, coreCost);
		if (minCost == 0) {
			ns.printf("Failed to get price for hack node %d upgrades!", current);
			ns.toast("Failed to get price for hack node upgrades!", "error", null);
			return;
		}
		if (cashNeeded == 0) {
			if (levelCost == Infinity && ramCost == Infinity && coreCost == Infinity) {
				ns.printf("Node %d fully upgraded", current);
				current++;
				continue;
			}
			cashNeeded = Math.min(levelCost, ramCost, coreCost);
			ns.printf("Need %s for next upgrade (node %d)", ns.formatNumber(cashNeeded, 3, 1000), current);
			continue;
		}
		if (levelCost == minCost) {
			if (!ns.hacknet.upgradeLevel(current, 1)) {
				ns.printf("Failed to upgrade hack node %d level!", current);
				ns.toast("Failed to upgrade hack node level!", "error", null);
				return;
			}
			ns.printf("Upgraded hack node %d one level", current);
		} else if (ramCost == minCost) {
			if (!ns.hacknet.upgradeRam(current, 1)) {
				ns.printf("Failed to upgrade hack node %d RAM!", current);
				ns.toast("Failed to upgrade hack node level!", "error", null);
				return;
			}
			ns.printf("Upgraded hack node %d RAM", current);
		} else if (coreCost == minCost) {
			if (!ns.hacknet.upgradeCore(current, 1)) {
				ns.printf("Failed to upgrade hack node %d cores!", current);
				ns.toast("Failed to upgrade hack node level!", "error", null);
				return;
			}
			ns.printf("Upgraded hack node %d one core", current);
		} else {
			ns.printf("Failed to decide what to upgrade on hack node %d", current);
			ns.toast("Failed to decide what to upgrade on hack node!", "error", null);
			return;
		}
		cashNeeded = 0;
	}
	ns.toast("All desired hack nodes are fully upgraded", "success", null);
}