"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, custom, encodeFunctionData, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const STAKING_CONTRACTS = {
  electroneum: "0x007481e3F2C1ee5E4e767639C29c726b246Dd743",
};

const BUDDY_TOKEN_ADDRESS = "0x38B54f147303887BD2E932373432FfCBD11Ff6a5";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const [contractAddress, setContractAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [operation, setOperation] = useState("stake");

  // Global staking info
  const [apy, setAPY] = useState("N/A");
  const [earnedRewards, setEarnedRewards] = useState("N/A");
  const [totalActual, setTotalActual] = useState("N/A");
  const [totalEffective, setTotalEffective] = useState("N/A");

  // Individual staking info
  const [individualActual, setIndividualActual] = useState("0");
  const [individualEffective, setIndividualEffective] = useState("0");
  const [individualMultiplier, setIndividualMultiplier] = useState("0");
  const [individualStakeTime, setIndividualStakeTime] = useState("N/A");
  // State to store stake timestamp for bonus countdown
  const [stakeTimestamp, setStakeTimestamp] = useState(0);
  // Bonus timer (30 days now)
  const [bonusTimeRemaining, setBonusTimeRemaining] = useState("N/A");

  // New contract parameters
  const [minStakingPeriodState, setMinStakingPeriodState] = useState("N/A");
  const [earlyWithdrawalPeriodState, setEarlyWithdrawalPeriodState] = useState("N/A");
  const [earlyWithdrawalPenaltyState, setEarlyWithdrawalPenaltyState] = useState("N/A");
  const [totalRewardsAccumulatedState, setTotalRewardsAccumulatedState] = useState("N/A");

  useEffect(() => {
    if (isConnected) {
      setContractAddress(STAKING_CONTRACTS.electroneum);
    }
  }, [isConnected, chain]);

  // Fetch staking info every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStakingInfo();
    }, 2000);
    return () => clearInterval(interval);
  }, [contractAddress, address, chain]);

  // Update bonus timer (30 days)
  useEffect(() => {
    const BONUS_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
    const timer = setInterval(() => {
      if (stakeTimestamp > 0) {
        const bonusEnd = stakeTimestamp * 1000 + BONUS_PERIOD_MS;
        const now = Date.now();
        const diff = bonusEnd - now;
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setBonusTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
        } else {
          setBonusTimeRemaining("Finished");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stakeTimestamp]);

  const waitForTransactionReceipt = async (txHash) => {
    let receipt = null;
    while (!receipt) {
      receipt = await window.ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      });
      if (!receipt) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return receipt;
  };

  const checkAndApprove = async (requiredAmount) => {
    const client = createPublicClient({
      chain: chain.id,
      transport: custom(window.ethereum),
    });

    const erc20ABI = [
      {
        name: "allowance",
        type: "function",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      },
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ];

    const allowanceData = encodeFunctionData({
      abi: [erc20ABI[0]],
      functionName: "allowance",
      args: [address, contractAddress],
    });

    const allowanceResponse = await client.call({
      to: BUDDY_TOKEN_ADDRESS,
      data: allowanceData,
    });

    const currentAllowance = BigInt(allowanceResponse.data);
    if (currentAllowance < BigInt(requiredAmount)) {
      const approveData = encodeFunctionData({
        abi: [erc20ABI[1]],
        functionName: "approve",
        args: [contractAddress, requiredAmount],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const approveTx = {
        to: BUDDY_TOKEN_ADDRESS,
        from: senderAddress,
        data: approveData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [approveTx],
      });
      console.log("Approval transaction sent:", txHash);
      alert("Approval transaction sent: " + txHash);
      const receipt = await waitForTransactionReceipt(txHash);
      if (!receipt || receipt.status !== "0x1") {
        throw new Error("Approval transaction failed");
      }
      console.log("Approval confirmed:", receipt);
    } else {
      console.log("Sufficient allowance found:", currentAllowance.toString());
    }
  };

  const handleStake = async () => {
    if (!amount || !isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const stakeAmount = parseUnits(amount, 18);
      await checkAndApprove(stakeAmount);

      const stakeData = encodeFunctionData({
        abi: [
          {
            name: "stake",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        functionName: "stake",
        args: [BUDDY_TOKEN_ADDRESS, stakeAmount],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: stakeData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log("Stake transaction sent:", txHash);
      alert("Stake transaction sent: " + txHash);
    } catch (err) {
      console.error("Error in stake:", err);
      alert("Error in stake: " + err.message);
    }
  };

  const handleUnstake = async () => {
    if (!amount || !isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const unstakeData = encodeFunctionData({
        abi: [
          {
            name: "withdraw",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        functionName: "withdraw",
        args: [BUDDY_TOKEN_ADDRESS, parseUnits(amount, 18)],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: unstakeData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log("Unstake transaction sent:", txHash);
      alert("Unstake transaction sent: " + txHash);
    } catch (err) {
      console.error("Error in unstake:", err);
      alert("Error in unstake: " + err.message);
    }
  };

  const handleClaimRewards = async () => {
    if (!isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const claimData = encodeFunctionData({
        abi: [
          {
            name: "claimReward",
            type: "function",
            inputs: [{ name: "token", type: "address" }],
          },
        ],
        functionName: "claimReward",
        args: [BUDDY_TOKEN_ADDRESS],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: claimData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log("Claim rewards transaction sent:", txHash);
      alert("Claim rewards transaction sent: " + txHash);
    } catch (err) {
      console.error("Error in claim rewards:", err);
      alert("Error in claim rewards: " + err.message);
    }
  };

  const handleUpdateMultiplier = async () => {
    if (!isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const updateData = encodeFunctionData({
        abi: [
          {
            name: "updateUserMultiplier",
            type: "function",
            inputs: [{ name: "token", type: "address" }],
          },
        ],
        functionName: "updateUserMultiplier",
        args: [BUDDY_TOKEN_ADDRESS],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: updateData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log("Update multiplier transaction sent:", txHash);
      alert("Update multiplier transaction sent: " + txHash);
    } catch (err) {
      console.error("Error in update multiplier:", err);
      alert("Error in update multiplier: " + err.message);
    }
  };

  // Helper function for unstaking by percentage
  const handleUnstakePercentage = async (percentage) => {
    if (!isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const currentStaked = Number(individualActual);
      if (currentStaked <= 0) {
        alert("No staked amount available");
        return;
      }
      if (percentage === 100) {
        // For 100%, call withdrawAll
        await handleWithdrawAll();
        return;
      }
      // Calculate the unstake amount (as a percentage of current staked)
      const unstakeAmount = parseUnits((currentStaked * (percentage / 100)).toString(), 18);
      const unstakeData = encodeFunctionData({
        abi: [
          {
            name: "withdraw",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        functionName: "withdraw",
        args: [BUDDY_TOKEN_ADDRESS, unstakeAmount],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: unstakeData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log(`Unstake ${percentage}% transaction sent:`, txHash);
      alert(`Unstake ${percentage}% transaction sent: ${txHash}`);
    } catch (err) {
      console.error(`Error in unstake ${percentage}%:`, err);
      alert(`Error in unstake ${percentage}%: ${err.message}`);
    }
  };

  const handleWithdrawAll = async () => {
    if (!isConnected) return;
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const withdrawAllData = encodeFunctionData({
        abi: [
          {
            name: "withdrawAll",
            type: "function",
            inputs: [{ name: "token", type: "address" }],
          },
        ],
        functionName: "withdrawAll",
        args: [BUDDY_TOKEN_ADDRESS],
      });
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const senderAddress = accounts[0];
      const tx = {
        to: contractAddress,
        from: senderAddress,
        data: withdrawAllData,
        value: "0x0",
      };
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      console.log("Withdraw all transaction sent:", txHash);
      alert("Withdraw all transaction sent: " + txHash);
    } catch (err) {
      console.error("Error in withdraw all:", err);
      alert("Error in withdraw all: " + err.message);
    }
  };

  // Fetch staking info including new parameters and accumulated rewards
  const fetchStakingInfo = async () => {
    if (!window.ethereum || !contractAddress || !address) return;
    try {
      const client = createPublicClient({
        chain: chain.id,
        transport: custom(window.ethereum),
      });

      // Global info
      const rewardDataTuple = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "rewardData",
            type: "function",
            inputs: [{ name: "", type: "address" }],
            outputs: [
              { name: "rewardRate", type: "uint256" },
              { name: "lastUpdateTime", type: "uint256" },
              { name: "rewardPerTokenStored", type: "uint256" },
              { name: "periodFinish", type: "uint256" }
            ],
            stateMutability: "view",
          },
        ],
        functionName: "rewardData",
        args: [BUDDY_TOKEN_ADDRESS],
      });

      const totalEffectiveData = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "totalEffectiveStaked",
            type: "function",
            inputs: [{ name: "token", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "totalEffectiveStaked",
        args: [BUDDY_TOKEN_ADDRESS],
      });

      const earnedData = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "earned",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "account", type: "address" },
            ],
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "earned",
        args: [BUDDY_TOKEN_ADDRESS, address],
      });

      const totalActualData = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "totalActualStaked",
            type: "function",
            inputs: [{ name: "token", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "totalActualStaked",
        args: [BUDDY_TOKEN_ADDRESS],
      });

      // Calculate APY
      const rewardRate = Number(rewardDataTuple[0]);
      const totalEff = Number(totalEffectiveData);
      let apyValue = 0;
      if (totalEff > 0) {
        const yearlyReward = rewardRate * 365 * 24 * 3600;
        apyValue = (yearlyReward * 100) / totalEff;
      }
      const earnedFormatted = Number(earnedData) / 1e18;
      const totalActualFormatted = Number(totalActualData) / 1e18;
      const totalEffectiveFormatted = totalEff / 1e18;

      setAPY(apyValue.toFixed(2));
      setEarnedRewards(earnedFormatted.toFixed(4));
      setTotalActual(totalActualFormatted.toFixed(0));
      setTotalEffective(totalEffectiveFormatted.toFixed(0));

      // Individual stake info
      const stakeInfoTuple = await client.readContract({
        address: contractAddress,
        abi: [
          {
            name: "stakes",
            type: "function",
            inputs: [
              { name: "", type: "address" },
              { name: "", type: "address" }
            ],
            outputs: [
              { name: "actualAmount", type: "uint256" },
              { name: "effectiveAmount", type: "uint256" },
              { name: "stakeTimestamp", type: "uint256" },
              { name: "multiplier", type: "uint256" }
            ],
            stateMutability: "view",
          },
        ],
        functionName: "stakes",
        args: [BUDDY_TOKEN_ADDRESS, address],
      });

      const indActual = Number(stakeInfoTuple[0]) / 1e18;
      const indEffective = Number(stakeInfoTuple[1]) / 1e18;
      const indMultiplier = Number(stakeInfoTuple[3]) / 1e18;
      const indTimestamp = Number(stakeInfoTuple[2]);
      const stakeDate = indTimestamp > 0 ? new Date(indTimestamp * 1000).toLocaleString() : "N/A";

      setIndividualActual(indActual.toFixed(0));
      setIndividualEffective(indEffective.toFixed(0));
      const multiplierFormatted = indMultiplier != 0 ? (indMultiplier - 1) * 100 : 0;
      setIndividualMultiplier(multiplierFormatted.toFixed(2));
      setIndividualStakeTime(stakeDate);
      setStakeTimestamp(indTimestamp);

      // New parameters: minStakingPeriod, earlyWithdrawalPeriod, earlyWithdrawalPenalty, totalRewardsAccumulated
      const minStakingPeriodData = await client.readContract({
        address: contractAddress,
        abi: [{
          name: "minStakingPeriod",
          type: "function",
          inputs: [],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        }],
        functionName: "minStakingPeriod",
        args: [],
      });
      setMinStakingPeriodState((Number(minStakingPeriodData) / (3600 * 24)).toFixed(0));

      const earlyWithdrawalPeriodData = await client.readContract({
        address: contractAddress,
        abi: [{
          name: "earlyWithdrawalPeriod",
          type: "function",
          inputs: [],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        }],
        functionName: "earlyWithdrawalPeriod",
        args: [],
      });
      setEarlyWithdrawalPeriodState((Number(earlyWithdrawalPeriodData) / (3600 * 24)).toFixed(0));

      const earlyWithdrawalPenaltyData = await client.readContract({
        address: contractAddress,
        abi: [{
          name: "earlyWithdrawalPenalty",
          type: "function",
          inputs: [],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        }],
        functionName: "earlyWithdrawalPenalty",
        args: [],
      });
      setEarlyWithdrawalPenaltyState(((Number(earlyWithdrawalPenaltyData) / 1e18) * 100).toFixed(0) + "%");

      const totalRewardsAccumulatedData = await client.readContract({
        address: contractAddress,
        abi: [{
          name: "totalRewardsAccumulated",
          type: "function",
          inputs: [{ name: "", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        }],
        functionName: "totalRewardsAccumulated",
        args: [BUDDY_TOKEN_ADDRESS],
      });
      const accumulatedRewardsFormatted = Number(totalRewardsAccumulatedData) / 1e18;
      setTotalRewardsAccumulatedState(accumulatedRewardsFormatted.toFixed(2));

    } catch (error) {
      console.error("Error fetching staking info:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white py-12 pt-24 flex items-center">
      <div className="w-full max-w-6xl mx-auto px-4">
        {!isConnected ? (
          <div className="flex flex-col items-center">
            <p className="text-xl mb-6">
              Connect your wallet to access staking functions
            </p>
            <ConnectButton />
          </div>
        ) : (
          <div className="space-y-10 transition-all duration-300">
            {/* Operations Panel */}
            <div className="bg-gray-800 p-6 rounded-xl shadow-2xl transition-all duration-300">
              <h2 className="text-3xl font-bold mb-4 text-center">Staking Operations</h2>
              {/* Toggle between Stake and Unstake */}
              <div className="flex justify-center mb-6">
                <button
                  onClick={() => setOperation("stake")}
                  className={`px-4 py-2 rounded-l-lg text-xl font-bold transition-all duration-300 ${operation === "stake" ? "bg-green-600" : "bg-gray-700"
                    }`}
                >
                  Stake
                </button>
                <button
                  onClick={() => setOperation("unstake")}
                  className={`px-4 py-2 rounded-r-lg text-xl font-bold transition-all duration-300 ${operation === "unstake" ? "bg-red-600" : "bg-gray-700"
                    }`}
                >
                  Unstake
                </button>
              </div>
              {operation === "stake" ? (
                <div className="flex flex-col items-center transition-all duration-300">
                  <input
                    type="text"
                    placeholder="Amount (BUDDY)"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full lg:w-1/2 p-3 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl transition-all duration-300"
                  />
                  <button
                    onClick={handleStake}
                    className="mt-4 bg-green-600 hover:bg-green-700 transition duration-200 py-3 px-6 rounded-lg text-xl font-bold w-full max-w-xs"
                  >
                    Stake
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 transition-all duration-300">
                  <input
                    type="text"
                    placeholder="Amount (BUDDY)"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full lg:w-1/2 p-3 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl transition-all duration-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setAmount((Number(individualActual) * 0.25).toString())
                      }
                      className="bg-red-600 hover:bg-red-700 transition duration-200 py-2 px-3 rounded-lg text-lg font-bold"
                    >
                      25%
                    </button>
                    <button
                      onClick={() =>
                        setAmount((Number(individualActual) * 0.5).toString())
                      }
                      className="bg-red-600 hover:bg-red-700 transition duration-200 py-2 px-3 rounded-lg text-lg font-bold"
                    >
                      50%
                    </button>
                    <button
                      onClick={() =>
                        setAmount((Number(individualActual) * 0.75).toString())
                      }
                      className="bg-red-600 hover:bg-red-700 transition duration-200 py-2 px-3 rounded-lg text-lg font-bold"
                    >
                      75%
                    </button>
                    <button
                      onClick={() => setAmount(individualActual)}
                      className="bg-red-600 hover:bg-red-700 transition duration-200 py-2 px-3 rounded-lg text-lg font-bold"
                    >
                      100%
                    </button>
                  </div>
                  <button
                    onClick={handleUnstake}
                    className="mt-2 bg-red-600 hover:bg-red-700 transition duration-200 py-3 px-6 rounded-lg text-xl font-bold w-full max-w-xs"
                  >
                    Unstake
                  </button>
                  {/* Warning Message for Early Withdrawal */}
                  {stakeTimestamp > 0 &&
                    new Date().getTime() < stakeTimestamp * 1000 + Number(earlyWithdrawalPeriodState) * 24 * 60 * 60 * 1000 && (
                      <p className="mt-2 text-red-500 text-lg font-semibold text-center">
                        Warning: Withdrawing now will incur a 30% penalty because the early withdrawal period hasn’t passed.
                      </p>
                    )}
                </div>
              )}
              {/* Additional Operations */}
              <div className="flex flex-wrap gap-4 justify-center mt-6">
                <button
                  onClick={handleClaimRewards}
                  className="bg-blue-600 hover:bg-blue-700 transition duration-200 py-3 px-6 rounded-lg text-xl font-bold"
                >
                  Claim Rewards
                </button>
                {bonusTimeRemaining === "Finished" && (
                  <button
                    onClick={handleUpdateMultiplier}
                    className="bg-yellow-600 hover:bg-yellow-700 transition duration-200 py-3 px-6 rounded-lg text-xl font-bold"
                  >
                    Update Multiplier
                  </button>
                )}
              </div>
            </div>

            {/* Info Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 transition-all duration-300">
              {/* Global Staking Info */}
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2 pt-4 pb-4 rounded-xl shadow-2xl flex flex-col items-center justify-center text-center transition-all duration-300">
                <h2 className="text-3xl font-bold mb-3">Global Staking</h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm uppercase text-gray-300">APY</p>
                    <p className="text-2xl font-extrabold">{parseFloat(apy).toFixed(2)} %</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Total Staked</p>
                    <p className="text-2xl font-extrabold">{parseFloat(totalActual).toFixed(0)} BUDDY</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Total Rewards Given</p>
                    <p className="text-2xl font-extrabold">{parseFloat(totalRewardsAccumulatedState).toFixed(2)} BUDDY</p>
                  </div>
                </div>
              </div>
              {/* Unclaimed Rewards */}
              <div className="bg-gradient-to-br from-pink-500 to-yellow-500 p-2 pt-4 pb-4 rounded-xl shadow-2xl flex flex-col items-center justify-center text-center transition-all duration-300">
                <h2 className="text-3xl font-bold mb-3">Unclaimed Rewards</h2>
                <p className="text-5xl font-extrabold">{parseFloat(earnedRewards).toFixed(2)} BUDDY</p>
              </div>
              {/* My Staking */}
              <div className="bg-gradient-to-br from-green-600 to-green-800 p-2 pt-4 pb-4 rounded-xl shadow-2xl flex flex-col items-center justify-center text-center transition-all duration-300">
                <h2 className="text-3xl font-bold mb-3">My Staking</h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm uppercase text-gray-300">Stake Time</p>
                    <p className="text-2xl font-extrabold">{individualStakeTime}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Staked Tokens</p>
                    <p className="text-2xl font-extrabold">{parseFloat(individualActual).toFixed(0)} BUDDY</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Staking Bonus <br/> (Buddy Platinum Pass)</p>
                    <p className="text-2xl font-extrabold">
                      <span className="text-green-300"> +{individualMultiplier}%</span>
                    </p>
                  </div>
                </div>
                <a
                  href="https://mint.buddybattles.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block bg-white text-blue-600 font-bold py-3 px-6 rounded-full shadow-lg hover:shadow-xl transition duration-200 w-full lg:w-auto"
                >
                  Do you want a BONUS? <div>Mint BPP NFT!!</div>
                </a>
                <div className="mt-4"> 2.5% extra per NFT first month, 5% extra after</div>
              </div>
              {/* Staking Parameters & Accumulated Rewards */}
              <div className="bg-gradient-to-br from-blue-500 to-teal-500 p-2 pt-4 pb-4 rounded-xl shadow-2xl flex flex-col items-center justify-center text-center transition-all duration-300">
                <h2 className="text-3xl font-bold mb-3">Parameters & Rewards</h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm uppercase text-gray-300">Early Withdrawal</p>
                    <p className="text-2xl font-extrabold">{earlyWithdrawalPeriodState} days</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Early Withdrawal Penalty</p>
                    <p className="text-2xl font-extrabold">{earlyWithdrawalPenaltyState}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase text-gray-300">Reduced Bonus Period</p>
                    <p className="text-2xl font-extrabold">{minStakingPeriodState} days</p>
                  </div>
                  {stakeTimestamp > 0 && (
                    <div>
                      <p className="text-sm uppercase text-gray-300">Time for Full Bonus</p>
                      <p className="text-2xl font-extrabold">{bonusTimeRemaining}</p>
                      {bonusTimeRemaining === "Finished" && (
                        <p className="text-red-500 font-semibold text-lg">
                          Eligible! Click Update Multiplier!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

}
