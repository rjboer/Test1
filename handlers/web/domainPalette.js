export const domainPalette = [
        {
                id: 'general',
                label: 'General',
                icon: '📌',
                color: '#60a5fa',
                blocks: [
                        { id: 'goal', label: 'Goal', description: 'A destination or desired state.' },
                        { id: 'action', label: 'Action', description: 'Concrete step to advance the plan.' },
                        { id: 'risk', label: 'Risk', description: 'Potential issue to watch and mitigate.' },
                ],
        },
        {
                id: 'effects',
                label: 'Effects-Based Planning',
                icon: '🎯',
                color: '#34d399',
                blocks: [
                        { id: 'desired-effect', label: 'Desired Effect', description: 'Outcome to deliver or enable.' },
                        { id: 'task', label: 'Task', description: 'Work item that produces the effect.' },
                        { id: 'measure', label: 'Measure', description: 'Indicator that tracks progress.' },
                ],
        },
        {
                id: 'conflict',
                label: 'Conflict Resolution',
                icon: '⚔️',
                color: '#f87171',
                blocks: [
                        { id: 'conflict', label: 'Conflict', description: 'Competing needs or constraints.' },
                        { id: 'assumption', label: 'Assumption', description: 'Belief that drives the conflict.' },
                        { id: 'resolution', label: 'Resolution', description: 'Change that eases the tension.' },
                ],
        },
        {
                id: 'prerequisite',
                label: 'Prerequisite Tree',
                icon: '🌿',
                color: '#a78bfa',
                blocks: [
                        { id: 'intermediate', label: 'Intermediate Objective', description: 'Step needed before the goal.' },
                        { id: 'requirement', label: 'Requirement', description: 'Capability or resource to obtain.' },
                        { id: 'obstacle', label: 'Obstacle', description: 'Blocker to clear on the path.' },
                ],
        },
        {
                id: 'evidence',
                label: 'Evidence-Based Analysis',
                icon: '📑',
                color: '#fbbf24',
                blocks: [
                        { id: 'claim', label: 'Claim', description: 'Position or hypothesis being evaluated.' },
                        { id: 'evidence', label: 'Evidence', description: 'Supporting observation or data.' },
                        { id: 'counter', label: 'Counterpoint', description: 'Challenge to the current claim.' },
                ],
        },
];
