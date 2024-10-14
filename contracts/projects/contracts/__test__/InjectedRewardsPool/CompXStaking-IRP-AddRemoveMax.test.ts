import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';

import { InjectedRewardsPoolClient } from '../../contracts/clients/InjectedRewardsPoolClient';
import algosdk, { TransactionSigner } from 'algosdk';
import { TransactionSignerAccount } from '@algorandfoundation/algokit-utils/types/account';
import { byteArrayToUint128, getByteArrayValuesAsBigInts } from '../utils';

const fixture = algorandFixture();
algokit.Config.configure({ populateAppCallResources: true });

let appClient: InjectedRewardsPoolClient;
let admin: TransactionSignerAccount;
let stakedAssetId: bigint;
let rewardAssetOneId: bigint;
let rewardAssetTwoId: bigint;
let rewardAssetThreeId: bigint;
let rewardAssetFourId: bigint;
let rewardAssetFiveId: bigint;
const ONE_DAY = 86400n;
const BYTE_LENGTH_REWARD_ASSET = 8;

const rewardTokens: bigint[] = [];

async function getMBRFromAppClient() {
  const result = await appClient.compose().getMbrForPoolCreation({}, {}).simulate({ allowUnnamedResources: true })
  return result.returns![0]
}

describe('Injected Reward Pool setup/admin functions - no staking', () => {
  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount } = fixture.context;
    const { algorand } = fixture;
    admin = testAccount;

    appClient = new InjectedRewardsPoolClient(
      {
        sender: testAccount,
        resolveBy: 'id',
        id: 0,
      },
      algorand.client.algod
    );
    await algokit.ensureFunded(
      {
        accountToFund: admin,
        fundingSource: await algokit.getDispenserAccount(algorand.client.algod, algorand.client.kmd!),
        minSpendingBalance: algokit.algos(100),
      },
      algorand.client.algod,
    )

    const stakeAssetCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Stake Token',
    });
    stakedAssetId = BigInt((await stakeAssetCreate).confirmation.assetIndex!);

    const rewardAssetOneCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Reward Token one',
    });
    rewardAssetOneId = BigInt((await rewardAssetOneCreate).confirmation.assetIndex!);
    rewardTokens.push(rewardAssetOneId);

    const rewardAssetTwoCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Reward Token two',
    });
    rewardAssetTwoId = BigInt((await rewardAssetTwoCreate).confirmation.assetIndex!);
    rewardTokens.push(rewardAssetTwoId);

    const rewardAssetThreeCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Reward Token three',
    });
    rewardAssetThreeId = BigInt((await rewardAssetThreeCreate).confirmation.assetIndex!);
    rewardTokens.push(rewardAssetThreeId);

    const rewardAssetFourCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Reward Token four',
    });
    rewardAssetFourId = BigInt((await rewardAssetFourCreate).confirmation.assetIndex!);
    rewardTokens.push(rewardAssetFourId);

    const rewardAssetFiveCreate = algorand.send.assetCreate({
      sender: admin.addr,
      total: 999_999_999_000n,
      decimals: 6,
      assetName: 'Reward Token five',
    });
    rewardAssetFiveId = BigInt((await rewardAssetFiveCreate).confirmation.assetIndex!);
    rewardTokens.push(rewardAssetFiveId);

    await appClient.create.createApplication({
      adminAddress: admin.addr,
    });
    const { appAddress } = await appClient.appClient.getAppReference();

    await fixture.algorand.send.payment({
      sender: admin.addr,
      receiver: appAddress,
      amount: algokit.algos(20),
    });

    await appClient.initApplication({
      stakedAsset: stakedAssetId,
      rewardAssets: [rewardAssetOneId, 0n, 0n, 0n, 0n],
      oracleAdmin: admin.addr,
      minStakePeriodForRewards: ONE_DAY,
    }, { sendParams: { fee: algokit.algos(0.2) } });
  });

  test('confirm global state on initialisation', async () => {
    const globalState = await appClient.getGlobalState();
    expect(globalState.stakedAssetId!.asBigInt()).toBe(stakedAssetId);
    expect(globalState.lastRewardInjectionTime!.asBigInt()).toBe(0n);
    expect(globalState.minStakePeriodForRewards!.asBigInt()).toBe(ONE_DAY);
    expect(algosdk.encodeAddress(globalState.oracleAdminAddress!.asByteArray())).toBe(admin.addr);
  });

  test('init storage', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const [mbrPayment] = await getMBRFromAppClient();
    const payTxn = await algorand.transactions.payment({
      sender: admin.addr,
      receiver: appAddress,
      amount: algokit.microAlgos(Number(mbrPayment)),
    });

    const response = await appClient.compose()
      .gas({}, { note: '1' })
      .gas({}, { note: '2' })
      .initStorage({
        mbrPayment: {
          transaction: payTxn,
          signer: { signer: admin.signer, addr: admin.addr } as TransactionSignerAccount
        },
      },
        {
          sendParams: {
            fee: algokit.algos(0.2),
          },
        },)
      .execute({ populateAppCallResources: true })

    const boxNames = await appClient.appClient.getBoxNames();
    expect(boxNames.length).toBe(3);
  });



  test('Add Reward asset 2', async () => {
    const globalStateBefore = await appClient.getGlobalState();
    const rewards = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsBefore: bigint[] = getByteArrayValuesAsBigInts(rewards, BYTE_LENGTH_REWARD_ASSET);

    console.log('rewardsBefore', rewardsBefore);
    expect(rewardsBefore[0]).toBe(rewardAssetOneId);
    expect(rewardsBefore[1]).toBe(0n);
    expect(rewardsBefore[2]).toBe(0n);
    expect(rewardsBefore[3]).toBe(0n);
    expect(rewardsBefore[4]).toBe(0n);

    //Add new reward asset
    await appClient.addRewardAsset({ rewardAssetId: rewardAssetTwoId }, { sendParams: { fee: algokit.algos(0.1) } });
    const globalStateAfter = await appClient.getGlobalState();
    const rewardsAfter = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsAfterValues: bigint[] = getByteArrayValuesAsBigInts(rewardsAfter, BYTE_LENGTH_REWARD_ASSET);
    console.log('rewardsAfter', rewardsAfterValues);
    expect(rewardsAfterValues[0]).toBe(rewardAssetOneId);
    expect(rewardsAfterValues[1]).toBe(rewardAssetTwoId);
    expect(rewardsAfterValues[2]).toBe(0n);
    expect(rewardsAfterValues[3]).toBe(0n);
    expect(rewardsAfterValues[4]).toBe(0n);


  });

  test('Add Reward asset 3', async () => {
    const globalStateBefore = await appClient.getGlobalState();
    const rewards = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsBefore: bigint[] = getByteArrayValuesAsBigInts(rewards, BYTE_LENGTH_REWARD_ASSET);

    expect(rewardsBefore[0]).toBe(rewardAssetOneId);
    expect(rewardsBefore[1]).toBe(rewardAssetTwoId);
    expect(rewardsBefore[2]).toBe(0n);
    expect(rewardsBefore[3]).toBe(0n);
    expect(rewardsBefore[4]).toBe(0n);

    //Add new reward asset
    await appClient.addRewardAsset({ rewardAssetId: rewardAssetThreeId }, { sendParams: { fee: algokit.algos(0.1) } });
    const globalStateAfter = await appClient.getGlobalState();
    const rewardsAfter = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsAfterValues: bigint[] = getByteArrayValuesAsBigInts(rewardsAfter, BYTE_LENGTH_REWARD_ASSET);
    expect(rewardsAfterValues[0]).toBe(rewardAssetOneId);
    expect(rewardsAfterValues[1]).toBe(rewardAssetTwoId);
    expect(rewardsAfterValues[2]).toBe(rewardAssetThreeId);
    expect(rewardsAfterValues[3]).toBe(0n);
    expect(rewardsAfterValues[4]).toBe(0n);
  });
  test('Add Reward asset 4', async () => {
    const globalStateBefore = await appClient.getGlobalState();
    const rewards = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsBefore: bigint[] = getByteArrayValuesAsBigInts(rewards, BYTE_LENGTH_REWARD_ASSET);

    expect(rewardsBefore[0]).toBe(rewardAssetOneId);
    expect(rewardsBefore[1]).toBe(rewardAssetTwoId);
    expect(rewardsBefore[2]).toBe(rewardAssetThreeId);
    expect(rewardsBefore[3]).toBe(0n);
    expect(rewardsBefore[4]).toBe(0n);

    //Add new reward asset
    await appClient.addRewardAsset({ rewardAssetId: rewardAssetFourId }, { sendParams: { fee: algokit.algos(0.1) } });
    const globalStateAfter = await appClient.getGlobalState();
    const rewardsAfter = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsAfterValues: bigint[] = getByteArrayValuesAsBigInts(rewardsAfter, BYTE_LENGTH_REWARD_ASSET);
    expect(rewardsAfterValues[0]).toBe(rewardAssetOneId);
    expect(rewardsAfterValues[1]).toBe(rewardAssetTwoId);
    expect(rewardsAfterValues[2]).toBe(rewardAssetThreeId);
    expect(rewardsAfterValues[3]).toBe(rewardAssetFourId);
    expect(rewardsAfterValues[4]).toBe(0n);
  });

  test('Add Reward asset 5', async () => {
    const globalStateBefore = await appClient.getGlobalState();
    const rewards = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsBefore: bigint[] = getByteArrayValuesAsBigInts(rewards, BYTE_LENGTH_REWARD_ASSET);

    expect(rewardsBefore[0]).toBe(rewardAssetOneId);
    expect(rewardsBefore[1]).toBe(rewardAssetTwoId);
    expect(rewardsBefore[2]).toBe(rewardAssetThreeId);
    expect(rewardsBefore[3]).toBe(rewardAssetFourId);
    expect(rewardsBefore[4]).toBe(0n);

    //Add new reward asset
    await appClient.addRewardAsset({ rewardAssetId: rewardAssetFiveId }, { sendParams: { fee: algokit.algos(0.1) } });
    const globalStateAfter = await appClient.getGlobalState();
    const rewardsAfter = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsAfterValues: bigint[] = getByteArrayValuesAsBigInts(rewardsAfter, BYTE_LENGTH_REWARD_ASSET);
    expect(rewardsAfterValues[0]).toBe(rewardAssetOneId);
    expect(rewardsAfterValues[1]).toBe(rewardAssetTwoId);
    expect(rewardsAfterValues[2]).toBe(rewardAssetThreeId);
    expect(rewardsAfterValues[3]).toBe(rewardAssetFourId);
    expect(rewardsAfterValues[4]).toBe(rewardAssetFiveId);
  });


  test('Remove Reward assets', async () => {
    const globalStateBefore = await appClient.getGlobalState();
    const rewards = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsBefore: bigint[] = getByteArrayValuesAsBigInts(rewards, BYTE_LENGTH_REWARD_ASSET);

    expect(rewardsBefore[0]).toBe(rewardAssetOneId);
    expect(rewardsBefore[1]).toBe(rewardAssetTwoId);
    expect(rewardsBefore[2]).toBe(rewardAssetThreeId);
    expect(rewardsBefore[3]).toBe(rewardAssetFourId);
    expect(rewardsBefore[4]).toBe(rewardAssetFiveId);

    //Remove reward asset
    await appClient.removeRewardAsset({ rewardAssetId: rewardAssetOneId }, { sendParams: { fee: algokit.algos(0.1) } });
    await appClient.removeRewardAsset({ rewardAssetId: rewardAssetTwoId }, { sendParams: { fee: algokit.algos(0.1) } });
    await appClient.removeRewardAsset({ rewardAssetId: rewardAssetThreeId }, { sendParams: { fee: algokit.algos(0.1) } });
    await appClient.removeRewardAsset({ rewardAssetId: rewardAssetFourId }, { sendParams: { fee: algokit.algos(0.1) } });
    await appClient.removeRewardAsset({ rewardAssetId: rewardAssetFiveId }, { sendParams: { fee: algokit.algos(0.1) } });

    const globalStateAfter = await appClient.getGlobalState();
    const rewardsAfter = await appClient.appClient.getBoxValue('rewardAssets');
    const rewardsAfterValues: bigint[] = getByteArrayValuesAsBigInts(rewardsAfter, BYTE_LENGTH_REWARD_ASSET);
    console.log('rewardsAfter', rewardsAfterValues);
    expect(rewardsAfterValues[0]).toBe(0n);
    expect(rewardsAfterValues[1]).toBe(0n);
    expect(rewardsAfterValues[2]).toBe(0n);
    expect(rewardsAfterValues[3]).toBe(0n);
    expect(rewardsAfterValues[4]).toBe(0n);

  });

  test('inject rewards ASA 1', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const axferTxn = await algorand.transactions.assetTransfer({
      sender: admin.addr,
      receiver: appAddress,
      assetId: rewardAssetOneId,
      amount: 10n * 10n ** 6n,
    });

    await expect( appClient.injectRewards({ rewardTxn: axferTxn, quantity: 10n * 10n ** 6n, rewardAssetId: rewardAssetOneId },
      { assets: [Number(rewardAssetOneId)], sendParams: { populateAppCallResources: true } })
    ).rejects.toThrowError();
  });


  test('deleteApplication', async () => {
    await appClient.delete.deleteApplication({}, { sendParams: { fee: algokit.algos(0.2) } });
  });
});

