"""Tiny arithmetic interpreter: no eval/compile/exec or symbolic parser."""
import ast
import math
import operator

from .security import PipelineError, number

FUNCTIONS = {k: getattr(math, k) for k in ("sin", "cos", "tan", "exp", "log", "sqrt")}
FUNCTIONS["abs"] = abs
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class Expression:
    def __init__(self, text):
        if not isinstance(text, str) or not 0 < len(text) <= 256:
            raise PipelineError("Expression must have 1..256 characters")
        try:
            self.tree = ast.parse(text, mode="eval").body
        except (SyntaxError, RecursionError) as exc:
            raise PipelineError("Invalid expression") from exc
        if len(list(ast.walk(self.tree))) > 128:
            raise PipelineError("Expression is too complex")
        self._validate(self.tree, 0)

    def _validate(self, node, depth):
        if depth > 16:
            raise PipelineError("Expression nesting exceeds 16")
        if isinstance(node, ast.Constant):
            number(node.value)
        elif isinstance(node, ast.Name) and node.id in ("x", "pi", "e"):
            pass
        elif isinstance(node, ast.BinOp) and type(node.op) in (*OPS, ast.Pow):
            self._validate(node.left, depth + 1)
            self._validate(node.right, depth + 1)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            self._validate(node.operand, depth + 1)
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS and len(node.args) == 1 and not node.keywords:
            self._validate(node.args[0], depth + 1)
        else:
            raise PipelineError(f"Expression node is not allowed: {type(node).__name__}")

    def __call__(self, x):
        def visit(node):
            if isinstance(node, ast.Constant):
                result = node.value
            elif isinstance(node, ast.Name):
                result = {"x": x, "pi": math.pi, "e": math.e}[node.id]
            elif isinstance(node, ast.UnaryOp):
                result = visit(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
            elif isinstance(node, ast.Call):
                result = FUNCTIONS[node.func.id](visit(node.args[0]))
            else:
                left, right = visit(node.left), visit(node.right)
                if isinstance(node.op, ast.Pow):
                    if abs(right) > 32 or (left == 0 and right < 0):
                        raise ValueError("Exponent exceeds policy")
                    result = math.pow(left, right)
                else:
                    result = OPS[type(node.op)](left, right)
            return number(result, "expression result", 1e12)
        return visit(self.tree)
