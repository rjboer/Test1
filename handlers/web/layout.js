const DEFAULT_COLUMN_SPACING = 220;
const DEFAULT_NODE_SPACING = 140;
const DEFAULT_LANE_PADDING = 60;
const DEFAULT_LANE_GAP = 120;

function groupKey(value) {
        return value || 'ungrouped';
}

function buildTopology(nodes, links) {
        const nodeIds = new Set(nodes.map((n) => n.id));
        const incoming = new Map();
        const outgoing = new Map();
        nodeIds.forEach((id) => {
                incoming.set(id, new Set());
                outgoing.set(id, new Set());
        });

        links.forEach((link) => {
                if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) return;
                incoming.get(link.to).add(link.from);
                outgoing.get(link.from).add(link.to);
        });

        const indegree = new Map();
        nodeIds.forEach((id) => indegree.set(id, incoming.get(id).size));
        const queue = [...nodeIds].filter((id) => indegree.get(id) === 0);
        const order = [];
        const levels = new Map();

        while (queue.length) {
                const current = queue.shift();
                order.push(current);
                const currentLevel = levels.get(current) ?? 0;
                outgoing.get(current).forEach((next) => {
                        const nextLevel = Math.max(levels.get(next) ?? 0, currentLevel + 1);
                        levels.set(next, nextLevel);
                        indegree.set(next, indegree.get(next) - 1);
                        if (indegree.get(next) === 0) {
                                queue.push(next);
                        }
                });
        }

        // If we didn't process every node (cycle), place remaining nodes at their original level or zero.
        if (order.length !== nodeIds.size) {
                nodes.forEach((node) => {
                        if (!levels.has(node.id)) {
                                levels.set(node.id, 0);
                        }
                });
        }

        return { order, levels };
}

function laneOffsets(groups, perLaneCounts, nodeSpacing, lanePadding, laneGap) {
        const offsets = new Map();
        let cursor = 0;
        groups.forEach((group) => {
                offsets.set(group, cursor + lanePadding);
                const nodeCount = perLaneCounts.get(group) || 1;
                cursor += lanePadding * 2 + nodeSpacing * nodeCount + laneGap;
        });
        return offsets;
}

function deriveGroups(nodes, preferred = []) {
        const found = new Set(preferred.filter(Boolean));
        let hasUngrouped = false;
        nodes.forEach((node) => {
                if (node.group) found.add(node.group);
                else hasUngrouped = true;
        });
        if (hasUngrouped || !found.size) {
                found.add('ungrouped');
        }
        return Array.from(found);
}

export function computeCausalLayout(nodes = [], links = [], options = {}) {
        const columnSpacing = options.columnSpacing || DEFAULT_COLUMN_SPACING;
        const nodeSpacing = options.nodeSpacing || DEFAULT_NODE_SPACING;
        const lanePadding = options.lanePadding || DEFAULT_LANE_PADDING;
        const laneGap = options.laneGap || DEFAULT_LANE_GAP;
        const groupOrder = deriveGroups(nodes, options.groups || []);
        const { levels } = buildTopology(nodes, links);

        const grouped = new Map();
        groupOrder.forEach((group) => grouped.set(group, []));
        nodes.forEach((node) => {
                const key = groupKey(node.group);
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(node);
        });

        const perLaneCounts = new Map();
        grouped.forEach((list, key) => perLaneCounts.set(key, list.length || 1));
        const offsets = laneOffsets(groupOrder, perLaneCounts, nodeSpacing, lanePadding, laneGap);

        const positions = new Map();
        grouped.forEach((list, key) => {
                const sorted = list
                        .map((node) => ({
                                node,
                                level: levels.get(node.id) ?? 0,
                        }))
                        .sort((a, b) => (a.level - b.level) || a.node.label?.localeCompare(b.node.label || '') || 0);

                sorted.forEach(({ node, level }, index) => {
                        positions.set(node.id, {
                                x: columnSpacing * level + columnSpacing,
                                y: offsets.get(groupKey(node.group)) + index * nodeSpacing,
                        });
                });
        });

        return { positions, groups: groupOrder };
}

export function applyCausalLayout(board, options = {}) {
        if (!board) return null;
        const result = computeCausalLayout(board.causalNodes || [], board.causalLinks || [], options);
        result.positions.forEach((pos, id) => {
                const node = (board.causalNodes || []).find((n) => n.id === id);
                if (node) {
                        node.position = { ...pos };
                }
        });
        return result;
}
