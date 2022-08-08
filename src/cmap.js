const colors = [[1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 0, 0]]

export function cmap(x) {
    x = Math.min(0.999, Math.max(0, x))
    const p = x * (colors.length - 1);
    const i = Math.floor(p);
    const alpha = p - i;
    return [
        colors[i][0] * (1 - alpha) + colors[i + 1][0] * alpha,
        colors[i][1] * (1 - alpha) + colors[i + 1][1] * alpha,
        colors[i][2] * (1 - alpha) + colors[i + 1][2] * alpha,
    ];
}
