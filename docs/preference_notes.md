# Preference Notes

First of all, create a git repo for this project and commit all the current code.

We need some fine tuning on the UI.

1. Thumbnails views should be in landscape orientation, not portrait, or should be fit to the input image orientation (sometime the input facing page will be in portrait orientation).

- This may need a image orientation detection.

2. current | Gallery | Split | toggle options logic should be reconsider because current logic act very weird.

    - Sometimes it directly go to split mode with corretly splitted result.
    - Sometimes it directly go to split mode with incorrectly splitted result.
    - Sometimes it directly go to gallery mode with splitted result from previous split, in such case if go back to gallery mode, then come back to split mode, it will show correct result.

    - In short all these weird behaviors are mainly because not well managed the states of Gallery and Split mode + the logic of toggle options.

# Source
And we found browser integration is very tricky to access file outside of the browser sandbox. So we need a better way to handle the sample input pdf files, most likely we should embed the sample input pdf files in the application itself.

