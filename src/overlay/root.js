// The overlay's one element in the prototype's DOM: a host whose shadow root
// holds everything else. Its id is the string every module uses to keep the
// overlay out of its own way (anchors never match it, the trail never logs it,
// the click target never resolves to it), so it lives here once. Before this
// it was spelled out in six places across four files (review R6, #10 cycle).
export const ROOT_ID = 'gitmargin-root';
export const ROOT = `#${ROOT_ID}`;
