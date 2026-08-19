/// 检测时间断点
/// 间隔超出阈值的标记为断点
///
/// 阈值取 `median × multiplier` 与 `absolute_min_gap` 中的较大值。
/// `absolute_min_gap` 防止多采样率场景下（如 1s + 10s 混合数据），
/// 密集采样将全局中位数拉低，导致正常间隔被误判为断点。
pub fn detect_gaps(timestamps: &[f64], multiplier: f64) -> Vec<bool> {
    const ABSOLUTE_MIN_GAP: f64 = 60.0;

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

    // 取相对阈值和绝对阈值中的较大值，避免多采样率误判
    let threshold = (median * multiplier).max(ABSOLUTE_MIN_GAP);
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
        // 间隔 100s 远超 60s 绝对阈值，应被检测为断点
        let ts = vec![0.0, 1.0, 2.0, 102.0, 103.0, 104.0];
        let gaps = detect_gaps(&ts, 2.0);
        assert!(gaps[3]); // 2→102 的跳变
        assert!(!gaps[0]);
        assert!(!gaps[1]);
    }

    #[test]
    fn test_detect_gaps_single_point() {
        let ts = vec![100.0];
        let gaps = detect_gaps(&ts, 3.0);
        assert_eq!(gaps, vec![false]);
    }

    #[test]
    fn test_detect_gaps_empty() {
        let ts: Vec<f64> = vec![];
        let gaps = detect_gaps(&ts, 3.0);
        assert!(gaps.is_empty());
    }

    #[test]
    fn test_detect_gaps_multi_rate_no_false_positives() {
        // 模拟两种采样率混合：10秒间隔 + 1秒间隔
        // 这是实际 Excel 文件中的场景（8/1~8/13 为 10s，8/14~ 为 1s）
        let mut ts = Vec::new();
        // 前半段：10秒间隔
        for i in 0..200 {
            ts.push(i as f64 * 10.0);
        }
        // 大间隔（真正的断点，如过夜 1 小时）
        let last_before = *ts.last().unwrap();
        ts.push(last_before + 3600.0);
        // 后半段：1秒间隔
        let start_after = *ts.last().unwrap();
        for i in 1..200 {
            ts.push(start_after + i as f64);
        }

        let gaps = detect_gaps(&ts, 3.0);

        // 10秒间隔不应被标记为 gap（之前会被误判，因为全局中位数=1s，阈值=3s）
        for i in 0..200 {
            assert!(!gaps[i], "10秒间隔在索引 {} 被误判为断点", i);
        }

        // 1秒间隔不应被标记为 gap
        let after_gap_start = 201; // 大间隔之后的第一个点
        for i in after_gap_start..ts.len() {
            assert!(!gaps[i], "1秒间隔在索引 {} 被误判为断点", i);
        }

        // 1小时断点应被标记为 gap
        assert!(gaps[200], "1小时断点应被检测到");
    }

    #[test]
    fn test_detect_gaps_real_world_pattern() {
        // 模拟真实数据模式：
        // 8/1~8/13: 10秒间隔，每天有间隔
        // 8/14~8/17: 1秒间隔
        let mut ts = Vec::new();

        // 模拟 8/1~8/13（13天，每天部分时段有数据）
        for day in 0..13 {
            let day_start = day as f64 * 86400.0;
            // 每天约 8 小时数据，10 秒间隔
            for i in 0..(8 * 360 / 1) {
                ts.push(day_start + i as f64 * 10.0);
            }
        }

        // 过夜大间隔（约12小时）
        let last_before = *ts.last().unwrap();
        ts.push(last_before + 12.0 * 3600.0);

        // 模拟 8/14~8/17（4天，每天约 16 小时，1 秒间隔）
        let start_after = *ts.last().unwrap();
        for day in 0..4 {
            let day_start = start_after + day as f64 * 86400.0;
            for i in 0..(16 * 3600) {
                ts.push(day_start + i as f64);
            }
        }

        let gaps = detect_gaps(&ts, 3.0);

        // 统计误判数量
        let false_positives: Vec<usize> = gaps.iter().enumerate()
            .filter(|(i, &g)| {
                if !g { return false; }
                // 检查这个 gap 前后的间隔是否 < 60 秒
                if *i > 0 && *i < ts.len() {
                    let diff_before = ts[*i] - ts[*i - 1];
                    diff_before < 60.0
                } else {
                    false
                }
            })
            .map(|(i, _)| i)
            .collect();

        assert!(false_positives.is_empty(),
            "存在误判的断点: {:?}", false_positives);

        // 验证大间隔被正确检测
        let big_gap_count = gaps.iter().filter(|&&g| g).count();
        assert!(big_gap_count > 0, "应至少检测到一个真正的断点");
        assert!(big_gap_count < 20, "断点数量应合理，实际: {}", big_gap_count);
    }
}
