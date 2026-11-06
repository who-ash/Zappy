import { Composition } from "remotion";
import { DEFAULTS } from "../src/defaults";
import { cutsOf, outputLength } from "../src/cuts";
import { Demo, type DemoProps } from "./demo";

const empty: DemoProps = {
  timeline: {
    title: "",
    viewport: DEFAULTS.record.viewport,
    frames: [],
    offsetMs: 0,
    endMs: 1000,
    steps: [],
  },
  render: DEFAULTS.render,
};

export const Root = () => (
  <Composition
    id="Demo"
    component={Demo}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={1}
    defaultProps={empty}
    // Size, frame rate and length come from the props (the project's config).
    calculateMetadata={({ props }) => ({
      width: props.render.width,
      height: props.render.height,
      fps: props.render.fps,
      durationInFrames: Math.max(
        1,
        Math.ceil(
          (outputLength(
            props.timeline,
            cutsOf(props.timeline, props.render.maxPauseMs),
          ) /
            1000) *
            props.render.fps,
        ),
      ),
    })}
  />
);
