/// Largest Triangle Three Buckets 降采样
/// 保留时序视觉特征，适用于高采样率 CAN 信号
pub fn lttb_downsample(
    x: &[f64],
    y: &[f64],
    target: usize,
) -> (Vec<usize>, Vec<f64>, Vec<f64>) {
    let n = x.len();
    if n <= target || target < 3 {
        let indices: Vec<usize> = (0..n).collect();
        return (indices, x.to_vec(), y.to_vec());
    }

    let mut sampled_indices = Vec::with_capacity(target);
    sampled_indices.push(0); // 保留首点

    let bucket_size = (n - 2) as f64 / (target - 2) as f64;

    for i in 1..(target - 1) {
        let bucket_start = ((i - 1) as f64 * bucket_size) as usize + 1;
        let bucket_end = (i as f64 * bucket_size) as usize + 1;
        let end = bucket_end.min(n - 1);

        // 计算桶内平均值
        let mut avg_x = 0.0;
        let mut avg_y = 0.0;
        let count = end - bucket_start;
        if count > 0 {
            for j in bucket_start..end {
                avg_x += x[j];
                avg_y += y[j];
            }
            avg_x /= count as f64;
            avg_y /= count as f64;
        }

        // 在上一个采样点和平均值构成的三角形中找最大面积的点
        let prev_idx = sampled_indices[sampled_indices.len() - 1];
        let mut max_area = -1.0f64;
        let mut max_idx = bucket_start;

        for j in bucket_start..end {
            let area = ((x[prev_idx] - avg_x) * (y[j] - avg_y)
                - (x[j] - avg_x) * (y[prev_idx] - avg_y))
                .abs();
            if area > max_area {
                max_area = area;
                max_idx = j;
            }
        }
        sampled_indices.push(max_idx);
    }

    sampled_indices.push(n - 1); // 保留末点

    let sampled_x: Vec<f64> = sampled_indices.iter().map(|&i| x[i]).collect();
    let sampled_y: Vec<f64> = sampled_indices.iter().map(|&i| y[i]).collect();

    (sampled_indices, sampled_x, sampled_y)
}

/// 检测时间断点
/// 间隔超出中位数 × multiplier 的标记为断点
pub fn detect_gaps(timestamps: &[f64], multiplier: f64) -> Vec<bool> {
    if timestamps.len() < 2 {
        return vec![false; timestamps.len()];
    }

    let diffs: Vec<f64> = timestamps.windows(2).map(|w| w[1] - w[0]).collect();

    if diffs.is_empty() {
        return vec![false; timestamps.len()];
    }

    // 计算中位数间隔（排序副本，保留原顺序用于断点标记）
    let mut sorted = diffs.clone();
    sorted.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    let median = if sorted.len() % 2 == 0 {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    } else {
        sorted[sorted.len() / 2]
    };

    let threshold = median * multiplier;
    let mut gaps = vec![false; timestamps.len()];

    for (i, &diff) in diffs.iter().enumerate() {
        if diff > threshold {
            gaps[i + 1] = true; // 从 i+1 位置开始断点
        }
    }

    gaps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lttb_basic() {
        let x: Vec<f64> = (0..100).map(|i| i as f64).collect();
        let y: Vec<f64> = (0..100).map(|i| (i as f64).sin()).collect();
        let (indices, sx, sy) = lttb_downsample(&x, &y, 10);
        assert_eq!(sx.len(), 10);
        assert_eq!(sy.len(), 10);
        assert_eq!(indices.len(), 10);
        assert_eq!(sx[0], 0.0);
        assert_eq!(sx[9], 99.0);
    }

    #[test]
    fn test_lttb_small_input() {
        let x = vec![1.0, 2.0, 3.0];
        let y = vec![10.0, 20.0, 30.0];
        let (_indices, sx, sy) = lttb_downsample(&x, &y, 10);
        assert_eq!(sx.len(), 3);
        assert_eq!(sy, y);
    }

    #[test]
    fn test_lttb_preserves_extrema() {
        // 正弦波 + 尖峰 — 验证 LTTB 保留峰值形状
        let n = 1000;
        let x: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let mut y: Vec<f64> = (0..n).map(|i| (i as f64 * 0.1).sin()).collect();
        // 插入一个明显的尖峰
        y[500] = 100.0;
        let (indices, sx, sy) = lttb_downsample(&x, &y, 20);
        assert_eq!(sx.len(), 20);
        // 首尾点必须保留
        assert_eq!(sx[0], x[0]);
        assert_eq!(sx[19], x[n - 1]);
        // 尖峰索引 500 应该被采到（或者非常接近）
        let max_sy = sy.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!(max_sy > 50.0, "尖峰应被保留, max_sy={}", max_sy);
        // 索引数量必须匹配
        assert_eq!(indices.len(), 20);
        // 验证采样点至少包含一些非端点
        assert!(sy[1..19].iter().any(|&v| v > 0.0), "中段应有非零采样");
    }

    #[test]
    fn test_detect_gaps() {
        let ts = vec![0.0, 1.0, 2.0, 10.0, 11.0, 12.0];
        let gaps = detect_gaps(&ts, 2.0);
        assert!(gaps[3]); // 2→10 的跳变
        assert!(!gaps[0]);
        assert!(!gaps[1]);
    }
}
