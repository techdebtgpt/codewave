// test/baci-integration.test.ts
// Test file for BACI integration in MetricsCalculationService

import {
  MetricsCalculationService,
  BaciDataPoint,
  BACI_DEFAULTS,
} from '../src/services/metrics-calculation.service';

describe('BACI Integration Tests', () => {
  describe('computeBaciBoundedInteractive', () => {
    it('should calculate BACI scores for sample data with commits', () => {
      const testData: BaciDataPoint[] = [
        { commits: 5, baseTCS: 6.5 },
        { commits: 10, baseTCS: 7.2 },
        { commits: 3, baseTCS: 5.8 },
        { commits: 8, baseTCS: 7.0 },
        { commits: 12, baseTCS: 8.1 },
      ];

      const baciScores = MetricsCalculationService.computeBaciBoundedInteractive(testData);

      // Validate results
      expect(baciScores).toHaveLength(5);
      expect(baciScores.every((score) => score >= 1.0 && score <= 10.0)).toBe(true);

      // Test with custom options
      const customOptions = {
        qualityPrior: 6.0,
        volumeSensitivity: 0.4,
      };
      const customBaciScores = MetricsCalculationService.computeBaciBoundedInteractive(
        testData,
        customOptions
      );
      expect(customBaciScores).toHaveLength(5);
    });

    it('should handle edge cases', () => {
      // Empty data
      expect(MetricsCalculationService.computeBaciBoundedInteractive([])).toEqual([]);

      // Single data point
      const singlePoint = [{ commits: 5, baseTCS: 6.5 }];
      const result = MetricsCalculationService.computeBaciBoundedInteractive(singlePoint);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeGreaterThanOrEqual(1.0);
      expect(result[0]).toBeLessThanOrEqual(10.0);
    });
  });

  describe('calculateUserBaciScores', () => {
    it('should calculate user BACI scores from TCS and commit data', () => {
      const userBaseTCSMap = {
        alice: 7.2,
        bob: 6.5,
        charlie: 8.1,
        diana: 5.8,
      };

      const userCommitCounts = {
        alice: 10,
        bob: 5,
        charlie: 12,
        diana: 3,
      };

      const baciScores = MetricsCalculationService.calculateUserBaciScores(
        userBaseTCSMap,
        userCommitCounts
      );

      // Validate results
      expect(Object.keys(baciScores)).toEqual(['alice', 'bob', 'charlie', 'diana']);
      Object.values(baciScores).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(1.0);
        expect(score).toBeLessThanOrEqual(10.0);
      });
    });

    it('should handle empty input', () => {
      const result = MetricsCalculationService.calculateUserBaciScores({}, {});
      expect(result).toEqual({});
    });
  });

  describe('calculateTeamBaciScores', () => {
    it('should calculate complete BACI pipeline from raw metrics', () => {
      const mockMetrics = [
        {
          createdBy: 'alice',
          commitScore: 8.5,
          testingQuality: 7.0,
          technicalDebtRate: 6.5,
          deliveryRate: 8.0,
          functionalImpact: 7.5,
        },
        {
          createdBy: 'alice',
          commitScore: 7.5,
          testingQuality: 8.0,
          technicalDebtRate: 7.0,
          deliveryRate: 7.5,
          functionalImpact: 8.0,
        },
        {
          createdBy: 'bob',
          commitScore: 6.0,
          testingQuality: 6.5,
          technicalDebtRate: 5.5,
          deliveryRate: 6.0,
          functionalImpact: 6.5,
        },
        {
          createdBy: 'bob',
          commitScore: 6.5,
          testingQuality: 6.0,
          technicalDebtRate: 6.0,
          deliveryRate: 6.5,
          functionalImpact: 6.0,
        },
      ];

      const baciScores = MetricsCalculationService.calculateTeamBaciScores(mockMetrics);

      // Validate results
      expect(baciScores).toHaveProperty('alice');
      expect(baciScores).toHaveProperty('bob');
      expect(typeof baciScores.alice).toBe('number');
      expect(typeof baciScores.bob).toBe('number');

      // All scores should be in valid range
      Object.values(baciScores).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(1.0);
        expect(score).toBeLessThanOrEqual(10.0);
      });

      // Alice should have higher BACI score due to better metrics and more commits
      expect(baciScores.alice).toBeGreaterThan(baciScores.bob);
    });
  });

  describe('calculateSimpleAverageMetrics with commitScore', () => {
    it('should calculate author metrics including commit scores', () => {
      const mockEvaluations = [
        {
          agents: [
            {},
            {},
            {},
            {}, // Other agents
            {
              // Last agent (consensus)
              metrics: {
                codeQuality: 8.0,
                codeComplexity: 6.0,
                testCoverage: 7.5,
                functionalImpact: 8.2,
                actualTimeHours: 2.0,
                idealTimeHours: 1.8,
                technicalDebtHours: 1.2,
              },
            },
          ],
        },
      ];

      const stats = MetricsCalculationService.calculateSimpleAverageMetrics(mockEvaluations);

      expect(stats.commits).toBe(1);
      expect(stats.commitScore).toBeGreaterThan(0);
      expect(stats.commitScore).toBeLessThanOrEqual(10);
      expect(stats.quality).toBe(8.0);
      expect(stats.complexity).toBe(6.0);
    });
  });

  describe('calculateEnhancedAuthorStats', () => {
    it('should calculate enhanced stats with BACI scores', () => {
      const mockMetrics = [
        {
          createdBy: 'alice',
          codeQuality: 8.0,
          codeComplexity: 5.0,
          actualTimeHours: 2.0,
          testingQuality: 7.5,
          functionalImpact: 8.0,
        },
        {
          createdBy: 'bob',
          codeQuality: 6.0,
          codeComplexity: 7.0,
          actualTimeHours: 3.0,
          testingQuality: 6.0,
          functionalImpact: 6.5,
        },
      ];

      const enhancedStats = MetricsCalculationService.calculateEnhancedAuthorStats(mockMetrics);

      expect(enhancedStats).toHaveProperty('alice');
      expect(enhancedStats).toHaveProperty('bob');
      expect(enhancedStats.alice.commitScore).toBeGreaterThan(0);
      expect(enhancedStats.alice.baciScore).toBeDefined();
      expect(enhancedStats.bob.commitScore).toBeGreaterThan(0);
    });
  });

  describe('calculateTeamSummary', () => {
    it('should provide comprehensive team analysis with rankings', () => {
      const mockMetrics = [
        {
          createdBy: 'alice',
          codeQuality: 8.5,
          codeComplexity: 5.0,
          actualTimeHours: 2.0,
          testingQuality: 8.0,
          functionalImpact: 7.5,
        },
        {
          createdBy: 'alice',
          codeQuality: 7.5,
          codeComplexity: 6.0,
          actualTimeHours: 1.5,
          testingQuality: 7.5,
          functionalImpact: 8.0,
        },
        {
          createdBy: 'bob',
          codeQuality: 6.0,
          codeComplexity: 7.0,
          actualTimeHours: 3.0,
          testingQuality: 6.0,
          functionalImpact: 6.0,
        },
      ];

      const summary = MetricsCalculationService.calculateTeamSummary(mockMetrics);

      expect(summary).toHaveProperty('teamStats');
      expect(summary).toHaveProperty('teamBaci');
      // Note: rankings were removed from calculateTeamSummary as they weren't used in production

      // Verify team stats and BACI scores are populated
      expect(Object.keys(summary.teamStats)).toHaveLength(2);
      expect(Object.keys(summary.teamBaci)).toHaveLength(2);

      // Alice should have higher BACI score due to better metrics and more commits
      expect(summary.teamBaci.alice).toBeGreaterThan(summary.teamBaci.bob);
    });
  });
});
