import { useAppState, useConnectedAccount } from '@aragon/api-react';
import { DropDown, Field } from '@aragon/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAddress } from 'web3-utils';
import {
  addressPattern,
  addressesEqual,
  toDecimals,
  calculateNewFlowRate,
  calculateCurrentAmount,
  calculateRequiredDeposit,
  fromDecimals,
} from '../../../helpers';
import BaseSidePanel from '../BaseSidePanel';
import FlowRateField from './FlowRateField';
import LocalIdentitiesAutoComplete from '../../LocalIdentitiesAutoComplete';
import SubmitButton from '../SubmitButton';
import TokenSelector, { INITIAL_SELECTED_TOKEN } from '../TokenSelector';
import InfoBox from '../InfoBox';
import { ExistingFlowInfo, RequiredDepositInfo } from './InfoBoxes';
import SuperTokensLink from '../SuperTokensLink';

const validateFields = (
  superToken,
  recipient,
  flowRate,
  agentAddress,
  requiredDeposit,
  isOutgoingFlow,
  isCustomToken
) => {
  if (!isAddress(recipient)) {
    return 'Recipient must be a valid Ethereum address.';
  } else if (isOutgoingFlow && addressesEqual(recipient, agentAddress)) {
    return "You can't create a flow to the app's agent.";
  } else if (Number(flowRate) <= 0) {
    return "Flow rate provided can't be negative nor zero.";
  } else {
    let currentBalance, decimals, symbol;

    if (!isCustomToken) {
      const {
        balance,
        decimals: stDecimals,
        netFlow,
        symbol: stSymbol,
        lastUpdateDate,
      } = superToken;

      currentBalance = calculateCurrentAmount(balance, netFlow, lastUpdateDate);
      decimals = stDecimals;
      symbol = stSymbol;
    } else {
      const data = superToken.data;

      currentBalance = data.userBalance;
      decimals = data.decimals;
      symbol = data.symbol;
    }

    if (fromDecimals(currentBalance, decimals) < requiredDeposit) {
      return `Required deposit exceeds current ${symbol} balance.`;
    }
  }
};

const findSuperTokenByAddress = (address, superTokens) => {
  const index = superTokens.findIndex(superToken => addressesEqual(superToken.address, address));
  const superToken = superTokens[index];

  return {
    index,
    address: superToken.address,
    data: { decimals: superToken.decimals, name: superToken.name, symbol: superToken.symbol },
  };
};

const InnerUpdateFlow = ({ panelState, flows, superTokens, onUpdateFlow }) => {
  const connectedAccount = useConnectedAccount();
  const [selectedFlowType, setSelectedFlowType] = useState(1);
  const [recipient, setRecipient] = useState('');
  const [selectedToken, setSelectedToken] = useState(INITIAL_SELECTED_TOKEN);
  const [flowRate, setFlowRate] = useState('');
  const [errorMessage, setErrorMessage] = useState();
  const recipientInputRef = useRef();
  const { agentAddress } = useAppState();
  const requiredDeposit =
    selectedToken.index >= 0
      ? calculateRequiredDeposit(
          flowRate,
          superTokens[selectedToken.index].liquidationPeriodSeconds
        )
      : null;

  const { presetFlowTypeIndex, presetSuperTokenAddress, presetRecipient } =
    panelState.presetParams || {};
  const outgoingFlowSelected = selectedFlowType === 1;
  const isFlowUpdateOperation = Boolean(presetSuperTokenAddress && presetRecipient);
  const sender = outgoingFlowSelected ? agentAddress : connectedAccount;
  const disableSubmit = Boolean(
    errorMessage ||
      (!recipient && !presetRecipient) ||
      (!selectedToken.address && !presetSuperTokenAddress) ||
      !flowRate
  );
  const displayError = errorMessage && errorMessage.length;
  const existingFlow = useMemo(() => {
    if (isFlowUpdateOperation || !isAddress(recipient) || !isAddress(selectedToken.address)) {
      return null;
    }

    const flowIndex = flows.findIndex(
      f =>
        !f.isCancelled &&
        (outgoingFlowSelected ? !f.isIncoming : f.isIncoming) &&
        addressesEqual(f.entity, outgoingFlowSelected ? recipient : connectedAccount) &&
        addressesEqual(f.superTokenAddress, selectedToken.address)
    );

    return flows[flowIndex];
  }, [
    connectedAccount,
    flows,
    isFlowUpdateOperation,
    outgoingFlowSelected,
    recipient,
    selectedToken.address,
  ]);
  const displayFlowExists = existingFlow && Number(flowRate) > 0;

  const clear = () => {
    setSelectedFlowType(1);
    setRecipient('');
    setSelectedToken(INITIAL_SELECTED_TOKEN);
    setFlowRate('');
    setErrorMessage();
  };

  const handleFlowTypeChange = useCallback(
    index => {
      // Incoming flows have the Agent has the recipient.
      if (index === 0) {
        setRecipient(agentAddress);
      } else {
        setRecipient('');
      }
      setSelectedFlowType(index);
      setErrorMessage('');
    },
    [agentAddress]
  );

  const handleRecipientChange = useCallback(value => {
    setRecipient(value);
    setErrorMessage('');
  }, []);

  const handleTokenChange = useCallback(value => {
    setSelectedToken(value);
    setErrorMessage('');
  }, []);

  const handleFlowRateChange = useCallback(value => {
    setFlowRate(value);
    setErrorMessage('');
  }, []);

  const handleSubmit = async event => {
    event.preventDefault();
    const isCustomToken = selectedToken.index === -1;

    const error = validateFields(
      isCustomToken ? selectedToken : superTokens[selectedToken.index],
      recipient,
      flowRate,
      agentAddress,
      requiredDeposit,
      outgoingFlowSelected,
      isCustomToken
    );

    if (error && error.length) {
      setErrorMessage(error);
      return;
    }

    const newFlowRate = calculateNewFlowRate(existingFlow, flowRate);
    const adjustedFlowRate = toDecimals(newFlowRate, selectedToken.data.decimals);

    panelState.requestTransaction(onUpdateFlow, [
      selectedToken.address,
      sender,
      recipient,
      adjustedFlowRate,
      outgoingFlowSelected,
    ]);
  };

  useEffect(() => {
    return () => {
      clear();
    };
  }, []);

  // Handle reset when opening.
  useEffect(() => {
    if (panelState.didOpen && !isFlowUpdateOperation) {
      // reset to default values
      // Focus the right input after some time to avoid the panel transition to
      // be skipped by the browser.
      recipientInputRef && setTimeout(() => recipientInputRef.current.focus(), 100);
    }
  }, [isFlowUpdateOperation, panelState.didOpen]);

  // Set up preset params.
  useEffect(() => {
    if (!presetSuperTokenAddress || !presetRecipient) {
      return;
    }

    setSelectedFlowType(presetFlowTypeIndex);
    setRecipient(presetRecipient);
    setSelectedToken(findSuperTokenByAddress(presetSuperTokenAddress, superTokens));
  }, [presetFlowTypeIndex, presetRecipient, presetSuperTokenAddress, superTokens]);

  return (
    <>
      <form onSubmit={handleSubmit}>
        <Field label="Flow Type" required>
          <DropDown
            header="Flow Type"
            items={['Incoming', 'Outgoing']}
            selected={selectedFlowType}
            onChange={handleFlowTypeChange}
            disabled={isFlowUpdateOperation}
            wide
          />
        </Field>
        {outgoingFlowSelected && (
          <Field
            css={`
              height: 60px;
              ${isFlowUpdateOperation && 'pointer-events: none;'}
            `}
            label="Recipient (must be a valid Ethereum address)"
          >
            <LocalIdentitiesAutoComplete
              ref={recipientInputRef}
              onChange={handleRecipientChange}
              pattern={
                // Allow spaces to be trimmable
                ` *${addressPattern} *`
              }
              value={recipient}
              required
              wide
            />
          </Field>
        )}
        <TokenSelector
          tokens={superTokens}
          selectedToken={selectedToken}
          disabled={isFlowUpdateOperation}
          onChange={handleTokenChange}
          allowCustomToken={!outgoingFlowSelected}
          loadUserBalance={!outgoingFlowSelected}
        />
        <FlowRateField onChange={handleFlowRateChange} />
        <SubmitButton
          panelState={panelState}
          label={isFlowUpdateOperation || !!displayFlowExists ? 'Update' : 'Create'}
          disabled={disableSubmit}
        />
      </form>
      {displayError && <InfoBox mode="error">{errorMessage}</InfoBox>}
      {!isFlowUpdateOperation && (
        <InfoBox>
          {outgoingFlowSelected ? (
            <>
              By creating an <strong>Outgoing Flow</strong>, the app will stream <SuperTokensLink />{' '}
              from itself to the provided recipient account.
            </>
          ) : (
            <>
              By creating an <strong>Incoming Flow</strong>, you will stream <SuperTokensLink />{' '}
              from your account to the app.
            </>
          )}
        </InfoBox>
      )}
      {displayFlowExists && (
        <ExistingFlowInfo
          flow={existingFlow}
          selectedToken={selectedToken}
          flowRate={flowRate}
          isOutgoingFlow={outgoingFlowSelected}
        />
      )}
      {!!requiredDeposit && (
        <RequiredDepositInfo
          requiredDeposit={requiredDeposit}
          selectedToken={selectedToken}
          isOutgoingFlow={outgoingFlowSelected}
        />
      )}
    </>
  );
};

const UpdateFlow = React.memo(({ ...props }) => {
  const { panelState } = props;
  const { presetSuperTokenAddress, presetRecipient } = panelState.presetParams || {};
  const isFlowUpdateOperation = Boolean(presetSuperTokenAddress && presetRecipient);

  return (
    <BaseSidePanel
      title={isFlowUpdateOperation ? 'Update Flow' : 'Create Flow'}
      panelState={panelState}
    >
      <InnerUpdateFlow {...props} />
    </BaseSidePanel>
  );
});

export default UpdateFlow;
