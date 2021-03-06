import React from "react"
import {
	KeyboardAvoidingView,
	Platform,
	Text,
	StyleSheet,
	View,
	TouchableOpacity,
	ScrollView
} from "react-native"
import { connect } from "react-redux"
import { strings, errors } from "../../i18n"
import PageTitle from "../../components/PageTitle"
import {
	MAIN_PADDING,
	fullButton,
	API_DATE_FORMAT,
	SHORT_API_DATE_FORMAT,
	DISPLAY_SHORT_DATE_FORMAT,
	DEFAULT_DURATION
} from "../../consts"
import Hours from "../../components/Hours"
import InputSelectionButton from "../../components/InputSelectionButton"
import moment from "moment"
import { getHoursDiff, Analytics } from "../../actions/utils"
import DateTimePicker from "react-native-modal-datetime-picker"
import { fetchOrError } from "../../actions/utils"
import SuccessModal from "../../components/SuccessModal"
import { Icon } from "react-native-elements"
import LessonParent from "../LessonParent"

export class Lesson extends LessonParent {
	constructor(props) {
		super(props)
		this.duration =
			props.user.my_teacher.lesson_duration || DEFAULT_DURATION
		this.initState = {
			hours: [],
			dateAndTime: "",
			meetup: {},
			dropoff: {},
			meetupListViewDisplayed: false,
			dropoffListViewDisplayed: false,
			duration_mul: 1,
			duration: this.duration
		}
		this.state = {
			date: null,
			datePickerVisible: false,
			successVisible: false,
			...this.initState
		}
		this._onHourPress = this._onHourPress.bind(this)
		this.createLesson = this.createLesson.bind(this)
		this._handleDatePicked = this._handleDatePicked.bind(this)

		this._initializeExistingLesson()
	}

	_initializeExistingLesson = async () => {
		// if we're editing a lesson
		let lesson = this.props.navigation.getParam("lesson") || null
		if (this.props.navigation.getParam("lesson_id")) {
			lesson = await getLessonById(
				this.props.navigation.getParam("lesson_id")
			)
		}
		if (lesson) {
			// init duration, studentName, meetup, dropoff, hour
			this.state = {
				...this.state,
				lesson,
				dateAndTime: moment.utc(lesson.date).format(API_DATE_FORMAT),
				date: moment
					.utc(lesson.date)
					.local()
					.format(SHORT_API_DATE_FORMAT),
				meetup: { description: lesson.meetup_place },
				dropoff: { description: lesson.dropoff_place },
				hours: [[lesson.date, null]],
				hour: moment
					.utc(lesson.date)
					.local()
					.format("HH:mm"),
				duration_mul: lesson.duration / this.duration,
				duration: lesson.duration
			}
			await this._getAvailableHours(true)
		}
	}

	_getAvailableHours = async (append = false) => {
		if (!this.state.date) return
		const resp = await this.props.fetchService.fetch(
			`/teacher/${this.props.user.my_teacher.teacher_id}/available_hours`,
			{
				method: "POST",
				body: JSON.stringify({
					date: moment(this.state.date).format(SHORT_API_DATE_FORMAT),
					meetup_place_id: this.state.meetup.google_id,
					dropoff_place_id: this.state.dropoff.google_id,
					duration: this.state.duration
				})
			}
		)
		let hours = resp.json.data
		if (append) {
			// we're appending available hours to the current hour of the edited lesson
			hours = [...this.state.hours, ...resp.json.data]
		}
		this.setState({
			hours: hours
		})
	}

	_onHourPress = date => {
		this._scrollView.scrollToEnd()
		const hours = getHoursDiff(date, this.state.duration)
		this.setState({
			hour: hours["start"] + " - " + hours["end"],
			dateAndTime: moment.utc(date).format(API_DATE_FORMAT)
		})
	}

	renderHours = () => {
		if (!this.state.date) {
			return (
				<Text>
					{strings("student.new_lesson.pick_date_before_hours")}
				</Text>
			)
		}
		if (!this.state.meetup.description || !this.state.dropoff.description) {
			return (
				<Text>
					{strings("student.new_lesson.pick_places_before_hours")}
				</Text>
			)
		}
		if (this.state.hours.length == 0) {
			return (
				<Text>{strings("student.new_lesson.no_hours_available")}</Text>
			)
		}
		let noDuplicates = []
		return this.state.hours.map((hours, index) => {
			if (noDuplicates.includes(hours[0])) {
				return <View />
			}
			noDuplicates.push(hours[0])
			let selected = false
			let selectedTextStyle
			if (
				this.state.dateAndTime ==
				moment.utc(hours[0]).format(API_DATE_FORMAT)
			) {
				selected = true
				selectedTextStyle = { color: "#fff" }
			}
			return (
				<InputSelectionButton
					selected={selected}
					key={`hours${index}`}
					onPress={() => this._onHourPress(hours[0])}
				>
					<Hours
						style={{
							...styles.hoursText,
							...selectedTextStyle
						}}
						date={hours[0]}
						duration={this.state.duration}
					/>
				</InputSelectionButton>
			)
		})
	}

	createLesson = async () => {
		let lessonId = ""
		if (this.state.lesson) lessonId = this.state.lesson.id
		const resp = await this.props.dispatch(
			fetchOrError("/appointments/" + lessonId, {
				method: "POST",
				body: JSON.stringify({
					date: moment.utc(this.state.dateAndTime).toISOString(),
					meetup_place: this.state.meetup,
					dropoff_place: this.state.dropoff,
					duration: this.state.duration
				})
			})
		)
		if (resp) {
			Analytics.logEvent("student_created_lesson")
			this.setState({ ...this.initState, successVisible: true })
			this.clearPlaces()
		}
	}

	render() {
		let date = strings("student.new_lesson.pick_date")
		if (this.state.date) {
			date = moment(this.state.date).format(DISPLAY_SHORT_DATE_FORMAT)
		}
		const today = moment().toDate()
		const fourMonthsAway = moment()
			.add(4, "months")
			.toDate()
		let backButton, deleteButton
		if (this.state.lesson) {
			backButton = (
				<TouchableOpacity
					onPress={() => {
						this.props.navigation.goBack()
					}}
					style={styles.backButton}
				>
					<Icon name="arrow-forward" type="material" />
				</TouchableOpacity>
			)
			if (this.state.lesson.type == "lesson") {
				deleteButton = (
					<TouchableOpacity
						onPress={this.deleteConfirm.bind(this)}
						style={styles.deleteButton}
					>
						<Text style={{ color: "red" }}>
							{strings("delete_lesson")}
						</Text>
					</TouchableOpacity>
				)
			}
		}
		return (
			<View style={{ flex: 1, marginTop: 20 }}>
				<SuccessModal
					visible={this.state.successVisible}
					image="lesson"
					title={strings("student.new_lesson.success_title")}
					desc={strings("student.new_lesson.success_desc", {
						hours: this.state.hour,
						date
					})}
					buttonPress={() => {
						this.setState({ successVisible: false })
						this.props.navigation.goBack()
					}}
					button={strings("student.new_lesson.success_button")}
				/>
				<ScrollView
					ref={ref => (this._scrollView = ref)}
					style={styles.formContainer}
					keyboardDismissMode={
						Platform.OS === "ios" ? "interactive" : "on-drag"
					}
					keyboardShouldPersistTaps="handled"
				>
					<View style={styles.headerRow}>
						{backButton}
						<PageTitle
							style={styles.title}
							title={strings("teacher.new_lesson.title")}
						/>
						{deleteButton}
					</View>
					<TouchableOpacity onPress={this._showDateTimePicker}>
						<View style={styles.nonInputContainer}>
							<Text style={styles.nonInputTitle}>
								{strings("teacher.new_lesson.date")}
							</Text>
							<Text>{date}</Text>
						</View>
					</TouchableOpacity>
					<View style={styles.nonInputContainer}>
						<Text style={styles.nonInputTitle}>
							{strings("teacher.new_lesson.duration")}
						</Text>
					</View>
					{this.renderDuration()}
					<View style={styles.nonInputContainer}>
						<Text style={styles.nonInputTitle}>
							{strings("teacher.new_lesson.places")}
						</Text>
					</View>
					{this.renderPlaces()}
					<View style={styles.nonInputContainer}>
						<Text style={styles.nonInputTitle}>
							{strings("teacher.new_lesson.hour")}
						</Text>
					</View>
					<View style={styles.hours}>{this.renderHours()}</View>
				</ScrollView>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : null}
					keyboardVerticalOffset={Platform.select({
						ios: fullButton.height,
						android: null
					})}
				>
					<TouchableOpacity
						ref={touchable => (this._touchable = touchable)}
						onPress={this.createLesson}
						style={styles.submitButton}
					>
						<Text style={styles.doneText}>
							{strings("student.new_lesson.done")}
						</Text>
					</TouchableOpacity>
				</KeyboardAvoidingView>
				<DateTimePicker
					isVisible={this.state.datePickerVisible}
					onConfirm={this._handleDatePicked}
					onCancel={this._hideDateTimePicker}
					minimumDate={today}
					maximumDate={fourMonthsAway}
					date={new Date(this.state.date)}
				/>
			</View>
		)
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1
	},
	title: {
		marginLeft: 12,
		marginTop: 5
	},
	headerRow: {
		flexDirection: "row",
		flex: 1,
		maxHeight: 50,
		paddingLeft: MAIN_PADDING
	},
	formContainer: {
		width: 340,
		alignSelf: "center"
	},
	submitButton: { ...fullButton, position: "relative" },
	doneText: {
		color: "#fff",
		fontWeight: "bold",
		fontSize: 20
	},
	hoursText: {
		color: "gray"
	},
	hours: {
		flex: 1,
		flexWrap: "wrap",
		flexDirection: "row",
		justifyContent: "center"
	},
	nonInputContainer: {
		alignItems: "flex-start",
		marginLeft: MAIN_PADDING
	},
	nonInputTitle: {
		fontWeight: "bold",
		marginBottom: 8,
		marginTop: 12
	},
	backButton: {
		marginTop: 8
	},
	deleteButton: {
		marginLeft: "auto",
		marginTop: 6,
		paddingRight: MAIN_PADDING
	}
})

function mapStateToProps(state) {
	return {
		fetchService: state.fetchService,
		user: state.user,
		error: state.error
	}
}
export default connect(mapStateToProps)(Lesson)
