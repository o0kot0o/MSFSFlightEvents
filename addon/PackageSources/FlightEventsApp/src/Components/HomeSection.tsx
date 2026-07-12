import { DisplayComponent, FSComponent, VNode } from "@microsoft/msfs-sdk";
import "./HomeSection.scss";

export class HomeSection extends DisplayComponent<Record<string, never>> {
  public render(): VNode {
    return (
      <div class="fe-home">
        <p>Share your flight plan with other pilots, or join a flight someone else has posted.</p>
        <p class="fe-home-hint">Use the buttons below to get started.</p>
      </div>
    );
  }
}
