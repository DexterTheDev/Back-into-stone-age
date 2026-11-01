import Phaser from 'phaser';
import { KitchenScene } from './scenes/KitchenScene';
import { ReviewScene } from './scenes/ReviewScene';

new Phaser.Game({ width: 960, height: 600, parent: 'app', scene: [KitchenScene, ReviewScene] });
