# CompStat, read closely (private fork of CompStat Ledger)

An independent prototype, not an official Vital City product. Keep this fork private until it's ready;
don't merge it into compstat-ledger, whose default view it would replace.

Two views of NYPD's weekly CompStat numbers, built from the same data:

- **CompStat, read closely** (default, `src/bold/`): leads with a verdict computed from the data, runs every year-over-year change through a chance test (Poisson, continuity-corrected), draws each major felony's annual history since 1993 with this year's pace as a range, maps where crime concentrates, and prints the arithmetic behind every generated claim ("Show the math"). The statistics live in `src/bold/stats.js` and are unit-tested in `src/bold/stats.test.js` against a bundled Sept. 20, 2026 report.
- **Classic ledger** (`src/App.js`): the original dashboard, at `?classic=1`.

Maps: per-resident and chance-test choropleths, eight crime-by-crime small multiples, a 2010/1993 comparison map, and a locator on each precinct page. A "Press reports" toggle adds stories from seven New York City outlets in the GDELT news index (last three months only). A story is shown only if its headline names a place in the city and none outside it, and it is pinned to a precinct only if its headline names a neighborhood lying at least 85% inside that precinct, by the city's neighborhood boundaries (`tools/places/build_places.py`). Stories are leads, never counted in any figure.

"Dig deeper" (collapsed on every page) embeds a copy of the nyc-precinct-day explorer, "A day on the police radio," in `public/precinct-day/`, opened on the precinct in view and the latest day in NYPD's dispatch log. The copy adds only a `?pct=&date=` preselect; keep it in sync with nyc-precinct-day by hand.

Run `npm start`, or `npx react-scripts test src/bold` for the stats and press tests.

---

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
