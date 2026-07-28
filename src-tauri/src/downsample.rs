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
    fn test_detect_gaps() {
        let ts = vec![0.0, 1.0, 2.0, 10.0, 11.0, 12.0];
        let gaps = detect_gaps(&ts, 2.0);
        assert!(gaps[3]); // 2→10 的跳变
        assert!(!gaps[0]);
        assert!(!gaps[1]);
    }
}
