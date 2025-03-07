"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, custom, encodeFunctionData, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Dirección del contrato de staking (según la red)
const STAKING_CONTRACTS = {
  electroneum: "0x22fa4f932595114e2115d85320b6d9152447e226",
};

// Dirección del token Buddy (ERC‑20) – se usará de forma fija
const BUDDY_TOKEN_ADDRESS = "0x38B54f147303887BD2E932373432FfCBD11Ff6a5";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const [contractAddress, setContractAddress] = useState("");
  const [amount, setAmount] = useState("");

  // Estados para información del staking
  const [apy, setAPY] = useState("");
  const [earnedRewards, setEarnedRewards] = useState("");
  const [totalActual, setTotalActual] = useState("");
  const [totalEffective, setTotalEffective] = useState("");

  useEffect(() => {
    if (isConnected) {
      setContractAddress(STAKING_CONTRACTS.electroneum);
    }
  }, [isConnected, chain]);

  // Actualiza la info cada 2 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStakingInfo();
    }, 2000);
    return () => clearInterval(interval);
  }, [contractAddress, address, chain]);

  // Función para esperar a que se confirme una transacción
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

  // Función para aprobar el gasto de tokens si es necesario
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

  // Función para hacer stake
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

  // Función para hacer unstake
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

  // Función para reclamar rewards
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

  // Función para actualizar el multiplicador
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

  // Función para retirar todo el stake
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

  // Función para obtener información del staking y calcular el APY
  const fetchStakingInfo = async () => {
    if (!window.ethereum || !contractAddress || !address) return;
    try {
      const client = createPublicClient({
        chain: chain.id,
        transport: custom(window.ethereum),
      });

      // Leer rewardData (se accede por índice, ya que se devuelve como array)
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

      // Leer totalEffectiveStaked
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

      // Leer earned rewards para el usuario
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

      // Leer totalActualStaked
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

      // Convertir a números (asumiendo 18 decimales)
      const rewardRate = Number(rewardDataTuple[0]); // rewardRate
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
      setTotalActual(totalActualFormatted.toFixed(4));
      setTotalEffective(totalEffectiveFormatted.toFixed(4));
    } catch (error) {
      console.error("Error fetching staking info:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-lg">
        {!isConnected ? (
          <div className="flex flex-col items-center">
            <p className="mb-4">Connect your wallet to access staking functions</p>
            <ConnectButton />
          </div>
        ) : (
          <div>
            <p className="mb-4 text-center">Connected as: {address}</p>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Amount (in Buddy tokens)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded"
              />
              <div className="flex flex-col space-y-2">
                <button onClick={handleStake} className="bg-green-600 hover:bg-green-700 py-2 rounded">
                  Stake
                </button>
                <button onClick={handleUnstake} className="bg-red-600 hover:bg-red-700 py-2 rounded">
                  Unstake
                </button>
                <button onClick={handleClaimRewards} className="bg-blue-600 hover:bg-blue-700 py-2 rounded">
                  Claim Rewards
                </button>
                <button onClick={handleUpdateMultiplier} className="bg-yellow-600 hover:bg-yellow-700 py-2 rounded">
                  Update Multiplier
                </button>
                <button onClick={handleWithdrawAll} className="bg-purple-600 hover:bg-purple-700 py-2 rounded">
                  Withdraw All
                </button>
              </div>

              <div className="mt-6 p-4 border border-gray-700 rounded">
                <h2 className="text-xl font-bold mb-2">Staking Info</h2>
                <p>APY: {apy ? `${apy} %` : "N/A"}</p>
                <p>Earned Rewards: {earnedRewards ? `${earnedRewards} tokens` : "N/A"}</p>
                <p>Total Actual Staked: {totalActual ? `${totalActual} tokens` : "N/A"}</p>
                <p>Total Effective Staked: {totalEffective ? `${totalEffective} tokens` : "N/A"}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
