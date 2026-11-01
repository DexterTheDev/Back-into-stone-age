import { FractionItem } from '../systems/fractionEngine';

export class ReviewScene {
  private cache = new Map<string, unknown>();

  drawSummary(item: FractionItem) {
    const { numerator, denominator } = item.value;
    const shape = this.scene.add.graphics();
    for (let i = 0; i < denominator; i += 1) {
      const filled = i < numerator;
      shape.fillStyle(filled ? 0xf4a259 : 0xf7ede2, 1);
      shape.slice(120, 120, 90, (i / denominator) * Math.PI * 2, ((i + 1) / denominator) * Math.PI * 2);
      shape.fillPath();
    }
    return shape;
  }

  drawNextOrder(item: FractionItem) {
    const { numerator, denominator } = item.value;
    const shape = this.scene.add.graphics();
    for (let i = 0; i < denominator; i += 1) {
      const filled = i < numerator;
      shape.fillStyle(filled ? 0xf4a259 : 0xf7ede2, 1);
      shape.slice(120, 120, 90, (i / denominator) * Math.PI * 2, ((i + 1) / denominator) * Math.PI * 2);
      shape.fillPath();
    }
    return shape;
  }

}
