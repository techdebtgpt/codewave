import { AgentRegistry } from './agents/agent-registry';
import { BusinessAnalystAgent } from './agents/business-analyst-agent';
import { SDETAgent } from './agents/sdet-agent';
import { DeveloperAuthorAgent } from './agents/developer-author-agent';
import { SeniorArchitectAgent } from './agents/senior-architect-agent';
import { DeveloperReviewerAgent } from './agents/developer-reviewer-agent';
import { CommitEvaluationOrchestrator } from './orchestrator/commit-evaluation-orchestrator';

import { loadConfig, configExists } from './config/config-loader';


(async () => {
    if (!configExists()) {
        console.error('❌ No configuration found! Run: codewave config --init');
        process.exit(1);
    }

    const config = loadConfig();

    if (!config) {
        console.error('❌ Failed to load configuration!');
        process.exit(1);
    }

    const agentRegistry = new AgentRegistry();
    // Register all 5 conversation agents
    agentRegistry.register(new BusinessAnalystAgent(config));
    agentRegistry.register(new SDETAgent(config));
    agentRegistry.register(new DeveloperAuthorAgent(config));
    agentRegistry.register(new SeniorArchitectAgent(config));
    agentRegistry.register(new DeveloperReviewerAgent(config));

    const orchestrator = new CommitEvaluationOrchestrator(agentRegistry, config);

    // Example usage
    const context = {
        commitDiff: 'diff --git ...',
        filesChanged: ['src/foo.ts'],
    };
    const results = await orchestrator.evaluateCommit(context);
    console.log(results);
})();
