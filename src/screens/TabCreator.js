import React, { Component } from "react";
import Kalimba from "../components/Kalimba";
import { connect } from "react-redux";
import { getInstruments } from "mobx-music";
import { delay } from "q";
import NoteButton from "../components/NoteButton";
import AccidentalButton from "../components/AccidentalButton";
import ToolBarButton from "../components/ToolBarButton";
import { maximizeWindow } from "../menu-functions.js";
import {
  FaPlay,
  FaStop,
  FaSave,
  FaFolderOpen,
  FaFileExport,
  FaHome,
  FaHandPointer,
  FaPlus,
  FaFile,
} from "react-icons/fa";

import * as html2canvas from "html2canvas";
import * as jsPDF from "jspdf";

import ScaleLoader from "react-spinners/ScaleLoader";
import ClipLoader from "react-spinners/ClipLoader";
import QuarterRest from "../kalimbaImages/restImages/quarter_rest.png";
import PlayContextMenu from "../components/PlayContextMenu";
import ScreenWideModal from "../components/ScreenWideModal";
import NewSongWindow from "../components/NewSongWindow";

var app = window.require("electron").remote;
const fs = app.require("fs");

class TabCreator extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentNoteIndex: -1,
      kalimba: null,
      playing: false,
      isStopped: false,
      editTitle: false,
      editTempo: false,
      exporting: false,
      showNewSongWindow: false,
      height: window.innerHeight,
      enteredTempo: 0,
      showPlayContextMenu: false,
    };
  }

  /**
   * Saves the song in the form of its redux array to the file system
   * @return {void} returns early if the user cancels
   */
  saveSong = async () => {
    //create kalimba folder if it doesn't exist
    let docpath = app.app.getPath("documents") + "/KalimbaTabs";
    if (!fs.existsSync(docpath)) {
      fs.mkdir(docpath, (err) => {
        if (err) alert(err);
      });
    }
    let contentToSave = {
      songTitle: this.props.songTitle,
      tempo: this.props.tempo,
      tineNotes: this.props.tineNotes,
      song: this.props.song,
    };
    //if the file already exists save it with no dialog
    if (fs.existsSync(docpath + "/" + this.props.songTitle + ".kal")) {
      fs.writeFile(
        docpath + "/" + this.props.songTitle + ".kal",
        JSON.stringify(contentToSave),
        (err) => {
          if (err) {
            alert("An error occurred while saving " + err.message);
          } else {
            alert("Successfully saved '" + this.props.songTitle + "'");
          }
        }
      );
      return;
    }
    let options = {
      title: this.props.songTitle,
      defaultPath: docpath + "/" + this.props.songTitle + ".kal",
    };
    app.dialog.showSaveDialog(options).then((file) => {
      if (file.canceled) {
        return;
      }
      fs.writeFile(file.filePath, JSON.stringify(contentToSave), (err) => {
        if (err) {
          alert("An error occurred while saving " + err.message);
        } else {
          alert("Successfully saved '" + this.props.songTitle + "'");
        }
      });
    });
  };

  /**
   * Opens a .kal file from the user's KalimbaTabs folder
   * @return {void} returns early if an error occurs opening the song
   */
  openSong = () => {
    //stop song if it's playing
    this.stopSong();
    //create kalimba folder if it doesn't exist
    let docpath = app.app.getPath("documents") + "/KalimbaTabs";
    if (!fs.existsSync(docpath)) {
      fs.mkdir(docpath, (err) => {
        if (err) alert(err);
      });
    }
    let options = {
      defaultPath: app.app.getPath("documents") + "/KalimbaTabs",
    };
    app.dialog.showOpenDialog(options).then((files) => {
      fs.readFile(files.filePaths[0], "utf-8", (err, data) => {
        if (err) {
          alert("An error occurred reading the file(s)" + err.message);
          return;
        }
        this.setState({
          editTitle: false,
          editTempo: false,
          isStopped: false,
          currentNoteIndex: -1,
        });

        this.props.openSong(JSON.parse(data));
        let kalimbaElement = document.getElementById("kalimbaContainer");
        kalimbaElement.scrollTop = kalimbaElement.scrollHeight;
      });
    });
  };

  /**
   * Stops the song playback
   */
  stopSong = () => {
    this.setState({
      isStopped: true,
      playing: false,
      currentNoteIndex: -1,
    });
  };

  /**
   * Plays the song by going through the redux song array
   * and collecting the locations with notes
   */
  playSong = async (fromStart, noteIndex) => {
    if (this.state.playing) {
      return;
    }
    this.setState({ playing: true, isStopped: false });
    let kalimbaElement = document.getElementById("kalimbaContainer");
    kalimbaElement.scrollTop = kalimbaElement.scrollHeight;
    let optimizedSong = [];
    //start the note search depending on user input
    //if they right clicked, play from the last clicked note
    //otherwise, play from the beginning
    let start =
      this.props.lastNoteIndex === 0
        ? this.props.song.length - 1
        : !fromStart
        ? this.props.song.length - 1
        : this.props.lastNoteIndex;

    //if they manually chose a note to start from, start there
    if (noteIndex !== undefined) {
      start = noteIndex;
    }

    //go through the song array and pick out only the notes that need to be played
    for (let i = start; i >= 0; i--) {
      let notesToPlay = { notes: [], time: 4 };
      let shortestInterval = -1;
      let fastestTempo = -1;
      for (let j = 0; j < this.props.song[0].length; j++) {
        let noteToAdd = "";
        if (this.props.song[i][j].tempo !== undefined) {
          if (this.props.song[i][j].tempo > fastestTempo) {
            notesToPlay.tempo = this.props.song[i][j].tempo;
          }
        }
        if (this.props.song[i][j].note !== "") {
          noteToAdd = this.props.song[i][j].note;
        } else {
          continue;
        }
        if (shortestInterval < this.props.song[i][j].time) {
          shortestInterval = this.props.song[i][j].time;
        }
        notesToPlay.notes.push(noteToAdd);
        notesToPlay.time = shortestInterval;
      }
      optimizedSong.push(notesToPlay);
    }

    //go through optimizedSong, playing each note at the index
    //waits each iteration for as long as the shortest note at the index
    let currentTempo = this.props.tempo;
    for (let i = 0; i < optimizedSong.length; i++) {
      if (
        optimizedSong[i].tempo !== -1 &&
        optimizedSong[i].tempo !== undefined
      ) {
        currentTempo = optimizedSong[i].tempo;
      }
      //set delay constant here so that users can change the tempo mid playback
      let delayConstant = 4 * (1000 / (currentTempo / 60));
      if (this.state.isStopped) {
        this.setState({
          currentNoteIndex: -1,
          isStopped: false,
          playing: false,
        });
        break;
      }
      //scroll the kalimba to the currently playing note
      kalimbaElement.scrollTop =
        kalimbaElement.scrollHeight -
        50 * (i + (this.props.song.length - start)) -
        window.innerHeight +
        50;

      //play each note in optimizedSong[i]
      for (let j = 0; j < optimizedSong[i].notes.length; j++) {
        if (optimizedSong[i].notes[j] !== "rest") {
          this.state.kalimba.play(optimizedSong[i].notes[j]);
        }
      }
      await delay(delayConstant / optimizedSong[i].time);
    }

    this.setState({ isStopped: false });
  };

  /**
   * Converts the kalimbaContainer element into a pdf.
   * Needs to scroll down every time it takes a snapshot of
   * the element.
   */
  exportToPDF = async () => {
    //maximize window for best exporting results
    maximizeWindow();
    await delay(1);

    this.setState({ exporting: true });
    let kalimbaElement = document.getElementById("kalimbaContainer");

    //scroll to the top
    kalimbaElement.scrollTop = 0;

    let pdf = new jsPDF("p", "px", "letter");
    let width = pdf.internal.pageSize.getWidth();
    var height = pdf.internal.pageSize.getHeight();
    let pdfHeight = kalimbaElement.offsetHeight;

    //add title and tempo to first page
    pdf.setFontSize(50);
    pdf.setFont("times", "bold");
    pdf.text(width / 2, height / 2, this.props.songTitle, { align: "center" });
    pdf.setFontSize(20);
    pdf.setFont("times", "print");
    pdf.text(width / 2, height / 2 + 50, "tempo: " + this.props.tempo, {
      align: "center",
    });
    pdf.setFontSize(10);
    //add the actual kalimba
    let totalPages = Math.ceil(kalimbaElement.scrollHeight / pdfHeight) - 1;
    for (let i = 0; i < totalPages + 1; i++) {
      html2canvas(kalimbaElement).then(async (canvas) => {
        let imgData = canvas.toDataURL("image/jpeg", 1.0);
        pdf.addPage("letter", "portrait");
        pdf.addImage(imgData, "PNG", 10, 0, width * 0.9, height);
        pdf.text(width - 15, height - 10, (totalPages - i + 1).toString());
      });

      //scroll up a page worth
      kalimbaElement.scrollTop += kalimbaElement.offsetHeight - 50;
      await delay(200);
    }

    //save pdf
    await delay(3000);
    pdf.save(this.props.songTitle + ".pdf");
    this.setState({ exporting: false });

    //scroll back to the bottom
    kalimbaElement.scrollTop = kalimbaElement.scrollHeight;
  };

  /**
   * Updates dimensions of kalimba to that of the window's height
   */
  updateDimensions() {
    this.setState({ height: window.innerHeight });
  }

  componentDidMount = async () => {
    //set up kalimba
    const { instruments } = await getInstruments(["kalimba"]);
    this.setState({ kalimba: instruments.get("kalimba") });
    //set window resize event listener
    this.updateDimensions();
    window.addEventListener("resize", () => {
      this.updateDimensions();
    });
  };

  componentWillUnmount = () => {
    window.removeEventListener("resize", () => {
      this.updateDimensions();
    });
  };

  render() {
    return (
      <div
        style={styles.tabCreatorContainer}
        onClick={() => {
          this.setState({ showPlayContextMenu: false });
        }}
      >
        {this.state.exporting && (
          <ScreenWideModal>
            <div style={styles.exportModal}>
              <div>Exporting Song...</div>
              <div style={{ margin: 10 }}>
                <ClipLoader />
              </div>
              <div>Don't resize the window for best results.</div>
            </div>
          </ScreenWideModal>
        )}
        {this.state.showNewSongWindow && (
          <NewSongWindow
            hide={() => {
              this.setState({ showNewSongWindow: false });
            }}
            onCreate={() => {
              //ask if they want to save this song

              this.setState({ showNewSongWindow: false });

              let kalimba = document.getElementById("kalimbaContainer");
              kalimba.scrollTop = kalimba.scrollHeight;
            }}
          />
        )}
        {/* TOOLBAR */}
        <div style={styles.controlPanelContainer}>
          {/* SONG CONTROL */}
          <div style={styles.songControlContainer}>
            {/* HOME BUTTON */}
            <ToolBarButton
              onClick={async () => {
                this.stopSong();
                await delay(1);
                this.props.history.push("/");
              }}
              name="Home"
            >
              <FaHome size={30} />
            </ToolBarButton>
            {/* NEW SONG */}
            <ToolBarButton
              onClick={() => {
                this.setState({ showNewSongWindow: true });
              }}
              name="New"
            >
              <FaFile size={25} />
            </ToolBarButton>
            {/* OPEN */}
            <ToolBarButton
              onClick={() => {
                this.openSong();
              }}
              name="Open"
            >
              <FaFolderOpen size={30} />
            </ToolBarButton>
            {/* SAVE */}
            <ToolBarButton
              onClick={() => {
                this.saveSong();
              }}
              name="Save"
            >
              <FaSave size={30} />
            </ToolBarButton>
            {/* EXPORT */}
            <ToolBarButton
              onClick={() => {
                this.exportToPDF();
              }}
              disabled={this.state.exporting || this.state.playing}
              selected={this.state.exporting}
              name="Export"
            >
              {this.state.exporting ? (
                <ClipLoader size={30} color="blue" />
              ) : (
                <FaFileExport size={30} />
              )}
            </ToolBarButton>
            {/* PLAY BUTTON */}
            <div style={{ position: "relative" }}>
              <ToolBarButton
                selected={this.state.playing}
                onClick={() => {
                  this.state.playing ? this.stopSong() : this.playSong(false);
                }}
                onContextMenu={() => {
                  this.setState({ showPlayContextMenu: true });
                }}
                name={this.state.playing ? "Stop" : "Play"}
              >
                {this.state.playing ? (
                  <FaStop color="red" size={30} />
                ) : (
                  <FaPlay color="blue" size={30} />
                )}
              </ToolBarButton>
              {this.state.showPlayContextMenu && (
                <PlayContextMenu
                  play={(fromMiddle) => {
                    this.state.playing
                      ? this.stopSong()
                      : this.playSong(fromMiddle);
                    this.setState({ showPlayContextMenu: false });
                  }}
                  isPlaying={this.state.playing}
                  stop={() => {
                    this.stopSong();
                  }}
                />
              )}
            </div>
          </div>
          {/* TITLE INPUT */}
          <div style={styles.titleContainer} id="titleandtempo">
            {!this.state.editTitle ? (
              <div
                onClick={() => {
                  this.setState({ editTitle: true });
                }}
                style={styles.songTitle}
              >
                {this.props.songTitle}
              </div>
            ) : (
              <input
                placeholder={this.props.songTitle}
                onKeyPress={(event) => {
                  if (event.key === "Enter") {
                    this.setState({ editTitle: false });
                  }
                }}
                style={styles.titleInput}
                onChange={(e) => {
                  this.props.changeTitle(e.target.value);
                }}
              />
            )}
            {!this.state.editTempo ? (
              <div
                onClick={() => {
                  this.setState({ editTempo: true });
                }}
                style={{ margin: 5 }}
              >
                {this.props.tempo}
              </div>
            ) : (
              <input
                onKeyPress={(event) => {
                  if (event.key === "Enter") {
                    this.setState({ editTempo: false });
                    this.props.changeTempo(this.state.enteredTempo);
                  }
                }}
                placeholder={this.props.tempo}
                style={styles.tempoInput}
                type="number"
                min="0"
                max="500"
                onChange={(e) => {
                  // this.props.changeTempo(e.target.value);
                  this.setState({ enteredTempo: e.target.value });
                }}
              />
            )}
          </div>
          {/* NOTE TOOLBAR */}
          <div style={styles.noteToolbarContainer}>
            {/* SELECTION MODE BUTTON */}
            <ToolBarButton
              selected={this.props.selectionMode}
              onClick={() => {
                this.props.toggleSelectionMode();
              }}
              name="Selection Mode"
            >
              <FaHandPointer />
            </ToolBarButton>
            <div style={styles.noteToolbarDivider} />
            {/* EXTEND SONG BUTTON */}
            <ToolBarButton
              onClick={() => {
                this.props.extendSong();
              }}
              name="Extend Song"
            >
              <FaPlus />
            </ToolBarButton>
            <div style={styles.noteToolbarDivider} />
            <NoteButton value={1} />
            <NoteButton value={2} />
            <NoteButton value={4} />
            <NoteButton value={8} />
            <NoteButton value={16} />
            <div style={styles.noteToolbarDivider} />
            <AccidentalButton value="♯" />
            <AccidentalButton value="♭" />
            <AccidentalButton value="♮" />
            <div style={styles.noteToolbarDivider} />
            {/* DOTTED BUTTON */}
            <ToolBarButton
              selected={this.props.dotted}
              onClick={() => {
                this.props.toggleDotted();
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: this.props.dotted ? "blue" : "black",
                }}
              />
            </ToolBarButton>
            {/* REST BUTTON */}
            <ToolBarButton
              selected={this.props.rest}
              onClick={() => {
                this.props.toggleRest();
              }}
            >
              <img
                src={QuarterRest}
                style={{ width: 15, height: "auto" }}
                alt={"resticon"}
              />
            </ToolBarButton>
            {/* TRIPLET BUTTON */}
            <ToolBarButton
              selected={this.props.tripletMode}
              onClick={() => {
                this.props.toggleTriplet();
              }}
              name="Triplet"
            >
              -3-
            </ToolBarButton>
          </div>
        </div>
        {/* EVERYTHING BELOW TOOLBAR */}
        <div style={styles.lowerHalf}>
          <div style={{ flex: 1 }}></div>
          <div
            id="kalimbaContainer"
            style={{
              ...styles.kalimbaContainer,
              height: this.state.height - 90,
            }}
          >
            {this.state.kalimba !== null ? (
              <Kalimba
                kalimba={this.state.kalimba}
                currentNote={this.state.currentNoteIndex}
                playing={this.state.playing}
                visibleHeight={this.state.height}
                playFromNote={(index) => {
                  this.playSong(false, index);
                }}
                scrollBack={() => {
                  let kalimbaContainer = document.getElementById(
                    "kalimbaContainer"
                  );
                  kalimbaContainer.scrollTop += 50 * 25;
                }}
              />
            ) : (
              <div style={{ alignSelf: "center" }}>
                <ScaleLoader />
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}></div>
        </div>
      </div>
    );
  }
}

/**
 * Redux functions
 */
const mapStateToProps = (state) => {
  return {
    tineNotes: state.tineNotes,
    song: state.song,
    tempo: state.tempo,
    songTitle: state.songTitle,
    dotted: state.dotted,
    rest: state.rest,
    tripletMode: state.tripletMode,
    lastNoteIndex: state.lastNoteIndex,
    selectionMode: state.selectionMode,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    toggleDotted: () => dispatch({ type: "TOGGLE_DOTTED" }),
    openSong: (data) => dispatch({ type: "OPEN_SONG", data: data }),
    changeTitle: (title) => dispatch({ type: "CHANGE_TITLE", title: title }),
    toggleRest: () => dispatch({ type: "TOGGLE_REST" }),
    changeTempo: (tempo) => dispatch({ type: "CHANGE_TEMPO", tempo: tempo }),
    toggleTriplet: () => dispatch({ type: "TOGGLE_TRIPLET" }),
    extendSong: () => dispatch({ type: "EXTEND_SONG" }),
    toggleSelectionMode: () => dispatch({ type: "TOGGLE_SELECTION_MODE" }),
    openNewSong: () => dispatch({ type: "OPEN_NEW_SONG" }),
  };
};

/**
 * Styling
 */
const divCenteredContent = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  flexDirection: "row",
};

const styles = {
  tabCreatorContainer: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  controlPanelContainer: {
    ...divCenteredContent,
    width: "100%",
    boxShadow: "0px 5px 5px grey",
    height: 60,
    backgroundColor: "rgb(245,245,245)",
    zIndex: 10,
  },
  noteToolbarContainer: {
    ...divCenteredContent,
    flex: 1,
  },
  noteToolbarDivider: {
    height: 50,
    width: 2,
    backgroundColor: "lightgrey",
    margin: 5,
  },
  songControlContainer: {
    marginLeft: 10,
    flex: 1,
    ...divCenteredContent,
    justifyContent: "",
  },
  songTitle: {
    margin: 5,
    fontSize: 30,
    fontWeight: "bold",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  titleContainer: {
    flex: 1,
    ...divCenteredContent,
    alignSelf: "center",
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
  titleInput: {
    textAlign: "center",
    borderRadius: 3,
    border: "3px solid lightgrey",
  },
  tempoInput: {
    textAlign: "center",
    borderRadius: 3,
    border: "3px solid lightgrey",
    width: 50,
    margin: 5,
  },
  lowerHalf: {
    flex: 1,
    height: "100%",
    display: "flex",
    position: "relative",
  },
  kalimbaContainer: {
    flex: 2,
    display: "flex",
    justifyContent: "center",
    overflow: "scroll",
  },
  exportModal: {
    ...divCenteredContent,
    flexDirection: "column",
  },
};

export default connect(mapStateToProps, mapDispatchToProps)(TabCreator);
