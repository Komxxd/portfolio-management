export type SizingType = 'QTY' | 'VALUE' | 'INCREASE_PCT' | 'DECREASE_PCT';
export type ActionType = 'BUY' | 'SELL' | 'ALERT';
export type IndicatorType = 'rsi' | 'dma50' | 'dma200' | 'price' | 'changePct';
export type ComparisonOperator = '<' | '>' | '<=' | '>=' | 'CROSSINGOVER' | 'CROSSINGUNDER' | '==';
export type LogicalConnector = 'AND' | 'OR';

export interface StrategyCondition {
  id: string;
  connector?: LogicalConnector;
  leftIndicator: IndicatorType | '';
  operator: ComparisonOperator | '';
  rightType: 'value' | 'indicator';
  rightValue?: number | '';
  rightIndicator?: IndicatorType | '';
}

export interface StrategyRule {
  id: string;
  portfolioId?: string;
  name: string;
  scope: 'global' | 'stock';
  targetSymbol?: string;
  action?: ActionType | '';
  sizingType?: SizingType | '';
  sizingValue?: number | '';
  conditions: StrategyCondition[];
  enabled: boolean;
  createdAt: string;
  frequency: 'daily' | 'realtime';
}

export const BLANK_RULE: StrategyRule = {
  id: '',
  name: '',
  scope: 'global',
  targetSymbol: 'ALL',
  action: '',
  sizingType: '',
  sizingValue: '',
  conditions: [],
  enabled: true,
  createdAt: '',
  frequency: 'daily'
};

export function formatRuleFormula(rule: StrategyRule): string {
  const hasAction = !!rule.action;
  const hasSizing = !!rule.sizingType || (rule.sizingValue !== '' && rule.sizingValue !== undefined);
  const hasConditions = rule.conditions && rule.conditions.length > 0;

  if (!hasAction && !hasSizing && !hasConditions && !rule.name) {
    return 'Configure strategy parameters above to preview formula';
  }

  const action = rule.action || '[ACTION]';
  const target = rule.scope === 'global' ? 'ALL_PORTFOLIO' : (rule.targetSymbol || 'TARGET');
  
  let sizing = '';
  if (rule.sizingType === 'QTY') {
    sizing = `QTY(${rule.sizingValue !== '' && rule.sizingValue !== undefined ? rule.sizingValue : '?'})`;
  } else if (rule.sizingType === 'VALUE') {
    sizing = `VALUE(${rule.sizingValue !== '' && rule.sizingValue !== undefined ? rule.sizingValue : '?'})`;
  } else if (rule.sizingType === 'INCREASE_PCT') {
    sizing = `INCREASE%(${rule.sizingValue !== '' && rule.sizingValue !== undefined ? rule.sizingValue : '?'})`;
  } else if (rule.sizingType === 'DECREASE_PCT') {
    sizing = `DECREASE%(${rule.sizingValue !== '' && rule.sizingValue !== undefined ? rule.sizingValue : '?'})`;
  } else if (rule.sizingValue !== '' && rule.sizingValue !== undefined) {
    sizing = `(${rule.sizingValue})`;
  } else {
    sizing = '[SIZING]';
  }

  if (!hasConditions) {
    return `${action} ${target} ${sizing} IF [CONDITIONS]`;
  }

  const conditionsStr = rule.conditions.map((cond, idx) => {
    const conn = idx > 0 ? ` ${cond.connector || 'AND'} ` : '';
    
    let left = cond.leftIndicator ? cond.leftIndicator : '[INDICATOR]';
    if (cond.leftIndicator === 'rsi') left = 'RSI(day)';
    else if (cond.leftIndicator === 'dma50') left = 'DMA(50)';
    else if (cond.leftIndicator === 'dma200') left = 'DMA(200)';
    else if (cond.leftIndicator === 'price') left = 'PRICE';
    else if (cond.leftIndicator === 'changePct') left = 'CHANGE%';

    const op = cond.operator || '[OP]';
    
    let right = '';
    if (cond.rightType === 'indicator') {
      if (cond.rightIndicator === 'dma200') right = 'DMA(200)';
      else if (cond.rightIndicator === 'dma50') right = 'DMA(50)';
      else if (cond.rightIndicator === 'rsi') right = 'RSI(day)';
      else if (cond.rightIndicator === 'price') right = 'PRICE';
      else right = cond.rightIndicator ? cond.rightIndicator : '[INDICATOR]';
    } else {
      right = (cond.rightValue !== '' && cond.rightValue !== undefined) 
        ? String(cond.rightValue) 
        : '[VALUE]';
    }

    const opFormatted = (op === 'CROSSINGOVER' || op === 'CROSSINGUNDER') ? ` ${op} ` : op;
    return `${conn}${left}${opFormatted.startsWith(' ') ? '' : ' '}${opFormatted}${opFormatted.endsWith(' ') ? '' : ' '}${right}`;
  }).join('');

  return `${action} ${target} ${sizing} IF ${conditionsStr}`;
}

export interface SignalAlert {
  symbol: string;
  ruleId: string;
  ruleName: string;
  action: 'BUY' | 'SELL' | 'ALERT';
  message: string;
  timestamp: string;
}

export function evaluateStrategyRule(
  rule: StrategyRule,
  symbol: string,
  indicators: { rsi?: number | null; dma50?: number | null; dma200?: number | null; price?: number | null; changePct?: number | null }
): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;

  let overallResult = true;

  for (let i = 0; i < rule.conditions.length; i++) {
    const cond = rule.conditions[i];
    const leftVal = getIndicatorValue(cond.leftIndicator, indicators);
    const rightVal = cond.rightType === 'indicator'
      ? getIndicatorValue(cond.rightIndicator, indicators)
      : Number(cond.rightValue);

    if (leftVal === null || rightVal === null || isNaN(leftVal) || isNaN(rightVal)) {
      return false;
    }

    let conditionPassed = false;
    switch (cond.operator) {
      case '<': conditionPassed = leftVal < rightVal; break;
      case '>': conditionPassed = leftVal > rightVal; break;
      case '<=': conditionPassed = leftVal <= rightVal; break;
      case '>=': conditionPassed = leftVal >= rightVal; break;
      case '==': conditionPassed = Math.abs(leftVal - rightVal) < 0.0001; break;
      case 'CROSSINGOVER':
        conditionPassed = leftVal > rightVal;
        break;
      case 'CROSSINGUNDER':
        conditionPassed = leftVal < rightVal;
        break;
    }

    if (i === 0) {
      overallResult = conditionPassed;
    } else {
      if (cond.connector === 'OR') {
        overallResult = overallResult || conditionPassed;
      } else {
        overallResult = overallResult && conditionPassed;
      }
    }
  }

  return overallResult;
}

function getIndicatorValue(ind: string | undefined, indicators: any): number | null {
  if (!ind) return null;
  if (ind === 'rsi') return indicators.rsi ?? null;
  if (ind === 'dma50') return indicators.dma50 ?? null;
  if (ind === 'dma200') return indicators.dma200 ?? null;
  if (ind === 'price') return indicators.price ?? null;
  if (ind === 'changePct') return indicators.changePct ?? null;
  return null;
}
