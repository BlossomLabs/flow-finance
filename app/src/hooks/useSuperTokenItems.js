import { useNetwork } from '@aragon/api-react';
import { useMemo } from 'react';
import {
  calculateCurrentAmount,
  DEFAULT_CURRENCY,
  getConvertedAmount,
  getConvertRateToken,
  isTestNetwork,
  ZERO_BN,
} from '../helpers';
import useConvertRates from './useConvertRates';

const useSuperTokenItems = superTokens => {
  const network = useNetwork();
  const isTestNet = network && isTestNetwork(network);
  const tokenAddresses = superTokens.map(superToken => getConvertRateToken(superToken, isTestNet));

  const convertRates = useConvertRates(tokenAddresses, [DEFAULT_CURRENCY], network?.type);

  const balanceItems = useMemo(() => {
    return (
      superTokens
        // Filter out tokens with empty balances.
        .filter(({ balance, netFlow, lastUpdateDate }) =>
          calculateCurrentAmount(balance, netFlow, lastUpdateDate).gt(ZERO_BN)
        )
        .map(superToken => {
          const {
            address,
            balance: amount,
            decimals,
            depletionDate,
            lastUpdateDate,
            logoURI,
            name,
            inflowRate,
            outflowRate,
            netFlow,
            symbol,
          } = superToken;

          const conversionRate =
            convertRates[getConvertRateToken(superToken, isTestNet)]?.[DEFAULT_CURRENCY];
          let convertedAmount, convertedNetFlow;

          if (conversionRate) {
            convertedAmount = getConvertedAmount(amount, conversionRate);
            convertedNetFlow = getConvertedAmount(netFlow, conversionRate);
          }

          return {
            address,
            amount,
            convertedAmount,
            decimals,
            depletionDate,
            lastUpdateDate,
            logoURI,
            name,
            inflowRate,
            outflowRate,
            netFlow,
            convertedNetFlow,
            symbol,
          };
        })
    );
  }, [convertRates, superTokens, isTestNet]);
  return balanceItems;
};

export default useSuperTokenItems;
