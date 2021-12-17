import { addressesEqual } from '../helpers/web3-helpers';
import { calculateFlowAmount, getFlowEventEntity, isFlowEqual } from './helpers';
import superTokenABI from '../abi/SuperToken.json';
import { getCurrentTimestamp } from '../helpers';

const superTokenContracts = new Map();

export const handleFlowUpdated = async (state, event, app, settings) => {
  const { agentAddress } = state;
  const {
    sender,
    receiver,
    token: tokenAddress,
    totalReceiverFlowRate,
    totalSenderFlowRate,
  } = event.returnValues;

  if (!isAgentSender(agentAddress, sender, receiver)) {
    return state;
  }

  const tokenContract = getSuperTokenContract(tokenAddress, app);

  const [newSuperTokens, newFlows] = await Promise.all([
    updateSuperTokens(
      state,
      tokenAddress,
      tokenContract,
      addressesEqual(agentAddress, sender) ? totalSenderFlowRate : totalReceiverFlowRate
    ),
    updateFlows(state, event, settings.superfluid.cfa.contract),
  ]);

  return {
    ...state,
    superTokens: newSuperTokens,
    flows: newFlows,
  };
};

export const handleVaultEvent = async (state, event, app) => {
  const { token: tokenAddress } = event.returnValues;
  const tokenContract = getSuperTokenContract(tokenAddress, app);

  return {
    ...state,
    superTokens: await updateSuperTokens(state, tokenAddress, tokenContract),
  };
};

export const handleSetAgent = async (
  state,
  { returnValues: { agent: newAgentAddress } },
  settings
) => {
  console.log('Should unsubscribe from previous agent and subscribe to the new one');

  // Cancel all old agent's subscriptions

  // Subscribe to new agent
};

const isAgentSender = (agentAddress, sender, receiver) => {
  return addressesEqual(agentAddress, sender) || addressesEqual(agentAddress, receiver);
};

const getSuperTokenContract = (tokenAddress, app) => {
  const tokenContract = superTokenContracts.has(tokenAddress)
    ? superTokenContracts.get(tokenAddress)
    : app.external(tokenAddress, superTokenABI);
  superTokenContracts.set(tokenAddress, tokenContract);

  return tokenContract;
};

const updateSuperTokens = async (
  { superTokens: oldSuperTokens, agentAddress },
  tokenAddress,
  tokenContract,
  netFlow
) => {
  const newSuperTokens = [...oldSuperTokens];
  let superTokenIndex = oldSuperTokens.findIndex(({ address }) =>
    addressesEqual(tokenAddress, address)
  );
  const updatedToken = {
    ...(superTokenIndex === -1
      ? await newSuperToken(tokenContract)
      : oldSuperTokens[superTokenIndex]),
    address: tokenAddress,
    lastUpdateTimestamp: getCurrentTimestamp(),
    balance: await tokenContract.balanceOf(agentAddress).toPromise(),
  };

  if (typeof netFlow !== 'undefined') {
    updatedToken.netFlow = netFlow;
  }

  if (superTokenIndex === -1) {
    newSuperTokens.push(updatedToken);
  } else {
    newSuperTokens[superTokenIndex] = updatedToken;
  }

  return newSuperTokens;
};

const updateFlows = async (state, event, cfaContract) => {
  const { agentAddress } = state;
  const { sender, receiver, flowRate, token: tokenAddress } = event.returnValues;
  const newFlows = [...state.flows];

  const isIncoming = addressesEqual(receiver, agentAddress);
  const { timestamp } = await cfaContract.getFlow(tokenAddress, sender, receiver).toPromise();
  const flowIndex = newFlows.findIndex(flow => isFlowEqual(flow, event));
  const flowExists = !!newFlows[flowIndex];

  // Create flow case
  if (!flowExists) {
    newFlows.push({
      isIncoming,
      entity: getFlowEventEntity(event, isIncoming),
      superTokenAddress: tokenAddress,
      accumulatedAmount: 0,
      creationTimestamp: timestamp,
      lastTimestamp: timestamp,
      flowRate,
    });
  }
  // Update flow case
  else if (flowExists && flowRate > 0) {
    newFlows[flowIndex] = {
      ...newFlows[flowIndex],
      accumulatedAmount: calculateFlowAmount(
        timestamp,
        newFlows[flowIndex].creationTimestamp,
        flowRate
      ),
      lastTimestamp: timestamp,
      flowRate,
    };
  }
  // Delete flow case
  else {
    delete newFlows[flowIndex];
  }

  return newFlows;
};

const newSuperToken = async tokenContract => {
  const [name, decimals, symbol, underlyingToken] = await Promise.all([
    tokenContract.name().toPromise(),
    tokenContract.decimals().toPromise(),
    tokenContract.symbol().toPromise(),
    tokenContract.getUnderlyingToken().toPromise(),
  ]);

  return {
    decimals,
    name,
    symbol,
    underlyingToken,
    netFlow: 0,
    balance: 0,
  };
};
