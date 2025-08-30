import React, { useMemo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import BN from "bn.js";
import { feeNumeratorToBps, FeeSchedulerMode, type PoolState } from "@meteora-ag/cp-amm-sdk";

interface FeeSchedulerGraphProps {
    poolState: PoolState;
}

export const FeeSchedulerGraph: React.FC<FeeSchedulerGraphProps> = ({ poolState }) => {
    const { baseFee } = poolState.poolFees;

    const totalDurationMinutes =
        baseFee.periodFrequency.muln(baseFee.numberOfPeriod).toNumber() / 60;

    const nowMinutes = (Date.now() / 1000 - poolState.activationPoint.toNumber()) / 60;
    const clampedNow = Math.max(0, Math.min(nowMinutes, totalDurationMinutes));

    const data = useMemo(() => {
        const points: { time: number; fee: number }[] = [];

        for (let i = 0; i <= baseFee.numberOfPeriod; i++) {
            const time = baseFee.periodFrequency.muln(i).toNumber() / 60;
            let fee: BN;

            if (baseFee.feeSchedulerMode === FeeSchedulerMode.Linear) {
                fee = baseFee.cliffFeeNumerator.sub(baseFee.reductionFactor.muln(i));
            } else {
                const decay = Math.pow(
                    1 - baseFee.reductionFactor.toNumber() / 10000,
                    i
                );
                fee = new BN(Math.floor(baseFee.cliffFeeNumerator.toNumber() * decay));
            }

            points.push({ time, fee: feeNumeratorToBps(fee) / 100 });
        }

        // Interpolate current fee
        let currentFee = 0;
        for (let i = 1; i < points.length; i++) {
            if (clampedNow <= points[i].time) {
                const prev = points[i - 1];
                const next = points[i];
                const ratio = (clampedNow - prev.time) / (next.time - prev.time || 1);
                currentFee = prev.fee + ratio * (next.fee - prev.fee);
                break;
            }
        }

        // Add synthetic current point if needed
        if (!points.some((p) => Math.abs(p.time - clampedNow) < 0.01)) {
            points.push({ time: clampedNow, fee: currentFee });
            points.sort((a, b) => a.time - b.time);
        }

        return points;
    }, [baseFee, clampedNow]);

    let currentFee = 0;
    for (let i = 1; i < data.length; i++) {
        if (clampedNow <= data[i].time) {
            const prev = data[i - 1];
            const next = data[i];
            const ratio = (clampedNow - prev.time) / (next.time - prev.time || 1);
            currentFee = prev.fee + ratio * (next.fee - prev.fee);
            break;
        }
    }

    return (
        <div className="w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />

                    {/* Axes with labels */}
                    <XAxis
                        dataKey="time"
                        stroke="#aaa"
                        label={{ value: "Time (minutes)", position: "insideBottom", offset: -5 }}
                    />
                    <YAxis
                        stroke="#aaa"
                        domain={[0, "dataMax"]}
                        label={{
                            value: "Fee (%)",
                            angle: -90,
                            position: "insideLeft",
                            offset: 20, // increase this value to move label to the right
                        }}
                    />

                    {/* Fee line */}
                    <Line
                        type="monotone"
                        dataKey="fee"
                        stroke="#9f7aea"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={false} // hide hover dot
                    />

                    {/* Red line for current fee */}
                    <ReferenceLine
                        x={clampedNow}
                        y={currentFee}
                        stroke="red"
                        strokeDasharray="3 3"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
