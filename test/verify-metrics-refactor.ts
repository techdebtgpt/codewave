import { MetricsCalculationService } from '../src/services/metrics-calculation.service';
import { SEVEN_PILLARS } from '../src/constants/agent-weights.constants';
import { AgentResult } from '../src/agents/agent.interface';

async function verifyMetricsRefactor() {
  console.log('🔍 Verifying Metrics Refactoring...');

  // 1. Verify SEVEN_PILLARS constant (8 raw metrics)
  console.log('\n1. Verifying SEVEN_PILLARS constant...');
  if (!SEVEN_PILLARS || SEVEN_PILLARS.length !== 8) {
    console.error(
      '❌ SEVEN_PILLARS constant is missing or has incorrect length (should be 8 raw metrics).'
    );
    process.exit(1);
  }
  console.log('✅ SEVEN_PILLARS constant is correct (8 raw metrics):', SEVEN_PILLARS);

  // 2. Verify calculateWeightedMetrics
  console.log('\n2. Verifying calculateWeightedMetrics...');
  const dummyAgentResults: AgentResult[] = [
    {
      agentName: 'Architect',
      agentRole: 'architect',
      summary: 'test',
      details: 'test details',
      metrics: {
        technicalDebtHours: 10,
        codeQuality: 8,
        testCoverage: 90,
        functionalImpact: 5,
        codeComplexity: 3,
        idealTimeHours: 5,
        actualTimeHours: 6,
        debtReductionHours: 2,
      },
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    {
      agentName: 'Reviewer',
      agentRole: 'reviewer',
      summary: 'test',
      details: 'test details',
      metrics: {
        technicalDebtHours: 12,
        codeQuality: 7,
        testCoverage: 85,
        functionalImpact: 6,
        codeComplexity: 4,
        idealTimeHours: 6,
        actualTimeHours: 7,
        debtReductionHours: 1,
      },
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
  ];

  const weightedMetrics = MetricsCalculationService.calculateWeightedMetrics(dummyAgentResults);
  console.log('Weighted Metrics:', weightedMetrics);

  const missingMetrics = SEVEN_PILLARS.filter((p: string) => !(p in weightedMetrics));
  if (missingMetrics.length > 0) {
    console.error('❌ Missing metrics in weighted calculation:', missingMetrics);
    process.exit(1);
  }
  console.log('✅ All 8 raw metrics present in weighted calculation.');

  console.log('\n🎉 Verification Successful! SEVEN_PILLARS constant is working correctly.');
}

verifyMetricsRefactor().catch((err) => {
  console.error('❌ Verification Failed:', err);
  process.exit(1);
});
