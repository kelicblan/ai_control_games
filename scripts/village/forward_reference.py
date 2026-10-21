"""Independent scalar FP32 reference matching the declared runtime operation order.

BLAS may reorder/reassociate reductions; it is not a bitwise oracle for the
runtime's bias-first, multiply-round, add-round contract. No training/export.
"""
import json
import sys
import numpy as np

data = json.load(sys.stdin)
weights = np.asarray(data['weights'], dtype=np.float32)
x = np.asarray(data['input'], dtype=np.float64)
offset = 0
layers = data['layers']
for i, (previous, width) in enumerate(zip(layers[:-1], layers[1:])):
    matrix = weights[offset:offset + previous * width].reshape(previous, width)
    offset += previous * width
    bias = weights[offset:offset + width]
    offset += width
    y = np.empty(width, dtype=np.float32)
    for j in range(width):
        value = bias[j]
        for k in range(previous):
            product = np.float32(float(x[k]) * float(matrix[k, j]))
            value = np.float32(float(value) + float(product))
        y[j] = value
    x = y
    if i < len(layers) - 2:
        x = np.maximum(x, 0)
assert offset == len(weights) and np.isfinite(x).all()
print(json.dumps({'score': float(x[0]), 'dtype': 'float32', 'reduction': 'bias-first-scalar-multiply-round-add-round', 'numpy': np.__version__}))
