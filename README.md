# Intergenmome visualization plugin for Galaxy

This plugin is intended to visualize the output generated by the [IslandCompare](http://github.com/brinkmanlab/islandcompare) workflow.

## Installation

- Clone this repo into the configured Galaxy visualizations plugin folder (`galaxy_root/config/plugins/visualizations/` by default).
- Currently, the newly created folder must be named `islandcompare` for the IslandCompare front-end to find it. This should change in the future.
- Restart Galaxy.

## Notes
// Use to inject input.b64: "sed -e '/<section id="injected_data" hidden="">/r ./input.b64'"
